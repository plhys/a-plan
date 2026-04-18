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

        logger.info('[GitSync] Initializing Git Sync...');
        await this.setupGit();
        
        // Initial pull
        await this.pull();

        // Schedule periodic sync
        const intervalMs = (this.config.GIT_SYNC.interval || 10) * 60 * 1000;
        this.syncIntervalId = setInterval(() => this.sync(), intervalMs);
        logger.info(`[GitSync] Scheduled periodic sync every ${this.config.GIT_SYNC.interval || 10} minutes.`);
    }

    async setupGit() {
        try {
            const { userEmail, userName, repoUrl } = this.config.GIT_SYNC;
            
            // 安全过滤：确保参数不包含 shell 特殊字符
            const safeRepoUrl = repoUrl.replace(/[;&|`$<>]/g, '');
            const safeEmail = (userEmail || '').replace(/[;&|`$<>]/g, '');
            const safeName = (userName || '').replace(/[;&|`$<>]/g, '');

            if (safeEmail) await execAsync(`git config --global user.email "${safeEmail}"`);
            if (safeName) await execAsync(`git config --global user.name "${safeName}"`);

            // Check if remote origin exists, if not add it
            try {
                await execAsync('git remote get-url origin');
                // 如果已存在但 URL 不同，更新它
                await execAsync(`git remote set-url origin "${safeRepoUrl}"`);
            } catch (e) {
                await execAsync(`git remote add origin "${safeRepoUrl}"`);
            }

            // Ensure we are on main branch
            try {
                await execAsync('git branch -M main');
            } catch (e) {}

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
            logger.info('[GitSync] Pulling latest configurations from remote...');
            // Stash local changes to avoid conflicts if any non-config files changed
            await execAsync('git stash');
            await execAsync('git pull origin main --rebase');
            await execAsync('git stash pop || true');
        } catch (error) {
            logger.warn('[GitSync] Pull failed (might be first time or no remote changes):', error.message);
        }
    }

    async push() {
        try {
            // Check for changes in configs/ and pwd
            const { stdout } = await execAsync('git status --porcelain configs/ pwd');
            if (stdout.trim()) {
                logger.info('[GitSync] Detected local configuration changes, pushing to remote...');
                await execAsync('git add configs/*.json pwd');
                await execAsync('git commit -m "Auto-sync: configurations updated via Web UI"');
                await execAsync('git push origin main');
                logger.info('[GitSync] Push successful.');
            } else {
                logger.debug('[GitSync] No configuration changes detected.');
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
