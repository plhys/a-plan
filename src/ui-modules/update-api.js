import { existsSync, readFileSync } from 'fs';
import logger from '../utils/logger.js';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { CONFIG } from '../core/config-manager.js';
import { getRequestBody } from '../utils/common.js';

const execAsync = promisify(exec);
const GITHUB_REPO = 'plhys/a-plan';
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/plhys/a-plan/main/VERSION';

/**
 * 比较版本号
 */
function compareVersions(v1, v2) {
    if (v1 === 'HEAD' || v2 === 'HEAD') return 1;
    const clean1 = v1.replace(/^v/, '');
    const clean2 = v2.replace(/^v/, '');
    const parts1 = clean1.split('.').map(Number);
    const parts2 = clean2.split('.').map(Number);
    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

/**
 * 从 GitHub 获取远程 VERSION 文件
 */
async function fetchRemoteVersion() {
    try {
        const response = await axios.get(GITHUB_RAW_URL, { 
            timeout: 5000,
            headers: { 'Accept': 'text/plain' }
        });
        return response.data.trim();
    } catch (error) {
        logger.error('[Update] Failed to fetch remote VERSION:', error.message);
        return null;
    }
}

/**
 * 检查更新 - 从 VERSION 文件获取版本号
 */
export async function checkForUpdates() {
    const versionFilePath = path.join(process.cwd(), 'VERSION');
    let localVersion = '0.0.0';
    
    // 1. 读取本地 VERSION 文件
    try {
        if (existsSync(versionFilePath)) {
            localVersion = readFileSync(versionFilePath, 'utf-8').trim();
        }
    } catch (e) {
        logger.error('[Update] Error reading local VERSION file:', e.message);
    }

    // 2. 从 GitHub 获取远程 VERSION
    let remoteVersion = null;
    let availableVersions = [];
    
    try {
        remoteVersion = await fetchRemoteVersion();
        
        if (remoteVersion) {
            // 获取远程的所有 Tags 作为可选版本列表
            await execAsync('git fetch --tags').catch(() => {});
            const { stdout } = await execAsync('git tag -l "v*"');
            const tags = stdout.split('\n')
                .map(t => t.trim())
                .filter(t => t.length > 0)
                .map(t => t.replace(/^v/, ''));
            
            // 添加远程 VERSION 作为最新版本
            availableVersions = [remoteVersion, ...tags];
        }
    } catch (error) {
        logger.error('[Update] Error checking updates:', error.message);
    }

    // 3. 比较版本号
    const hasUpdate = remoteVersion && compareVersions(remoteVersion, localVersion) > 0;

    return {
        hasUpdate: hasUpdate,
        localVersion: localVersion,
        latestVersion: remoteVersion || localVersion,
        availableVersions: availableVersions.length > 0 ? availableVersions : [localVersion],
        updateMethod: 'version-file'
    };
}

/**
 * 执行更新操作 - 更新到最新版本
 */
export async function performUpdate(targetVersion = null) {
    logger.info(`[Update] Manual update triggered. Target: ${targetVersion || 'latest'}`);

    try {
        // 1. 获取最新代码
        await execAsync('git fetch --all --tags --force');
        
        // 2. 如果指定了版本号，则 checkout 到对应 tag，否则更新到 main 最新
        if (targetVersion) {
            const tagName = targetVersion.startsWith('v') ? targetVersion : `v${targetVersion}`;
            logger.info(`[Update] Checking out to tag: ${tagName}...`);
            await execAsync('git reset --hard');
            await execAsync('git clean -fd');
            await execAsync(`git checkout ${tagName}`);
            await execAsync(`git reset --hard ${tagName}`);
        } else {
            logger.info('[Update] Switching to origin/main (latest)...');
            await execAsync('git fetch origin main');
            await execAsync('git reset --hard origin/main');
        }

        // 3. 补全生产依赖
        logger.info('[Update] Synchronizing dependencies...');
        await execAsync('npm install --production');

        // 4. 读取新的 VERSION 文件
        const newVersionPath = path.join(process.cwd(), 'VERSION');
        const newVersion = existsSync(newVersionPath) 
            ? readFileSync(newVersionPath, 'utf-8').trim() 
            : targetVersion || 'unknown';

        // 5. 触发 Master 进程热重启
        logger.info('[Update] Core synchronized. Notifying Master for restart...');
        setTimeout(() => {
            const masterPort = process.env.MASTER_PORT || 3100;
            axios.post(`http://127.0.0.1:${masterPort}/master/restart`).catch(err => {
                logger.warn('[Update] Master notify failed, manual restart recommended.');
            });
        }, 3000);

        return {
            success: true,
            message: `Successfully updated to v${newVersion}. Warming up...`,
            updated: true,
            target: newVersion
        };
    } catch (error) {
        logger.error('[Update] Sync failed:', error.message);
        return {
            success: false,
            message: `Sync failed: ${error.message}`,
            error: error.message
        };
    }
}

/**
 * 检查更新接口
 */
export async function handleCheckUpdate(req, res) {
    try {
        const updateInfo = await checkForUpdates();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updateInfo));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}

/**
 * 执行更新接口
 */
export async function handlePerformUpdate(req, res) {
    try {
        const body = await getRequestBody(req);
        const targetVersion = body?.tag || body?.version;
        const updateResult = await performUpdate(targetVersion);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updateResult));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}