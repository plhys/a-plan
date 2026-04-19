import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

class GitSyncManager {
    constructor(config) {
        this.config = config;
        this.syncIntervalId = null;
        this.isSyncing = false;
    }

    async init() {
        if (!this.config.GIT_SYNC?.enabled || !this.config.GIT_SYNC?.repoUrl) {
            logger.info('[GitSync] Git sync is disabled or not configured.');
            return;
        }

        logger.info('[GitSync] Initializing Git Sync in background...');
        await this.setupGit();
        
        // 极致加速：不再 await pull()，直接丢进后台运行
        this.pull().then(() => {
            logger.info('[GitSync] Initial background pull completed.');
        }).catch(err => {
            logger.warn('[GitSync] Initial background pull failed:', err.message);
        });

        // 依然保持定时同步
        const intervalMs = (this.config.GIT_SYNC.interval || 10) * 60 * 1000;
        this.syncIntervalId = setInterval(() => this.sync(), intervalMs);
    }

    async setupGit() {
        try {
            const { userEmail, userName, repoUrl, branch } = this.config.GIT_SYNC;
            const targetBranch = branch || 'main';
            
            if (userEmail) await execAsync(`git config --global user.email ${JSON.stringify(userEmail)}`);
            if (userName) await execAsync(`git config --global user.name ${JSON.stringify(userName)}`);

            // 检查并设置远程地址
            try {
                await execAsync('git remote get-url origin');
                if (repoUrl) await execAsync(`git remote set-url origin ${JSON.stringify(repoUrl)}`);
            } catch (e) {
                if (repoUrl) await execAsync(`git remote add origin ${JSON.stringify(repoUrl)}`);
            }

            // 分支处理：切换到指定分支，如果不存在则创建
            try {
                await execAsync(`git fetch origin ${targetBranch}`);
                await execAsync(`git checkout ${targetBranch}`);
            } catch (e) {
                logger.info(`[GitSync] Branch ${targetBranch} not found, creating...`);
                await execAsync(`git checkout -b ${targetBranch}`);
            }

        } catch (error) {
            logger.error('[GitSync] Failed to setup git:', error.message);
        }
    }

    async sync() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            logger.info('[GitSync] Starting periodic sync...');
            await this.pull();
            await this.push();
            logger.info('[GitSync] Periodic sync completed.');
        } catch (error) {
            logger.error('[GitSync] Sync failed:', error.message);
        } finally {
            this.isSyncing = false;
        }
    }

    async pull() {
        try {
            const targetBranch = this.config.GIT_SYNC.branch || 'main';
            logger.info(`[GitSync] Pulling latest from branch: ${targetBranch}`);
            await execAsync('git stash');
            await execAsync(`git pull origin ${targetBranch} --rebase`);
            await execAsync('git stash pop || true');
        } catch (error) {
            logger.warn('[GitSync] Pull failed:', error.message);
        }
    }

    async push() {
        try {
            const targetBranch = this.config.GIT_SYNC.branch || 'main';
            const { stdout } = await execAsync('git status --porcelain configs/ pwd');
            if (stdout.trim()) {
                logger.info(`[GitSync] Pushing changes to branch: ${targetBranch}`);
                await execAsync('git add configs/*.json pwd');
                await execAsync('git commit -m "Auto-sync: config update"');
                await execAsync(`git push origin ${targetBranch}`);
                logger.info('[GitSync] Push successful.');
            }
        } catch (error) {
            logger.error('[GitSync] Push failed:', error.message);
        }
    }

    stop() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }
}

let instance = null;

export function getGitSyncManager(config) {
    if (!instance && config) {
        instance = new GitSyncManager(config);
    }
    return instance;
}
