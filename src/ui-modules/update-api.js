import { existsSync, readFileSync, writeFileSync } from 'fs';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CONFIG } from '../core/config-manager.js';
import { parseProxyUrl } from '../utils/proxy-utils.js';
import { getRequestBody } from '../utils/common.js';

const execAsync = promisify(exec);
const GITHUB_REPO = 'plhys/a-plan';

function buildGitHubApiCandidates(repo) {
    const apiPath = `repos/${repo}/tags`;
    return [
        {
            name: 'github-direct',
            url: `https://api.github.com/${apiPath}`
        }
    ];
}

/**
 * 获取更新检查使用的代理配置
 */
function getUpdateProxyConfig() {
    return null;
}

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
 * 检查更新
 */
export async function checkForUpdates() {
    const versionFilePath = path.join(process.cwd(), 'VERSION');
    let localVersion = '2.14.6';
    try {
        if (existsSync(versionFilePath)) {
            localVersion = readFileSync(versionFilePath, 'utf-8').trim();
        }
    } catch (e) {}

    return {
        hasUpdate: true,
        localVersion,
        latestVersion: 'Latest (Stable)',
        availableVersions: ['HEAD'],
        updateMethod: 'git',
        error: null
    };
}

/**
 * 执行更新操作 (指向 plhys/a-plan 并支持重启)
 */
export async function performUpdate(targetTag = null) {
    logger.info(`[Update] Manual update triggered via plhys repo...`);

    try {
        // 1. 获取最新代码
        logger.info('[Update] Pulling latest code from origin main...');
        await execAsync('git fetch origin main');
        await execAsync('git reset --hard origin/main');

        // 2. 检查依赖
        logger.info('[Update] Running npm install...');
        await execAsync('npm install --production');

        // 3. 准备重启
        logger.info('[Update] Update successful, triggering service restart...');
        
        // 异步执行重启
        setTimeout(() => {
            const masterPort = process.env.MASTER_PORT || 3100;
            logger.info(`[Update] Requesting restart on port ${masterPort}...`);
            fetch(`http://localhost:${masterPort}/master/restart`, { method: 'POST' }).catch(() => {});
        }, 2000);

        return {
            success: true,
            message: 'Successfully updated to the latest version. Service is restarting...',
            updated: true,
            updateMethod: 'git-pull-hard'
        };
    } catch (error) {
        logger.error('[Update] Update failed:', error.message);
        throw error;
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
        const updateResult = await performUpdate();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updateResult));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}
