import { existsSync, readFileSync, writeFileSync } from 'fs';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
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
 * 检查更新 (极客版：直接从本地 Git 仓库获取 Tags)
 */
export async function checkForUpdates() {
    const versionFilePath = path.join(process.cwd(), 'VERSION');
    let localVersion = '3.0.0-beta.1';
    try {
        if (existsSync(versionFilePath)) {
            localVersion = readFileSync(versionFilePath, 'utf-8').trim();
        }
    } catch (e) {}

    try {
        // 1. 获取远程 Tags
        await execAsync('git fetch --all --tags --force');
        
        // 2. 列出所有 Tags，并尝试不同的排序方式
        const { stdout } = await execAsync('git tag -l');
        let tags = stdout.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        
        // 极客版排序：手动处理 beta 版本号，确保 v3.0.0-beta.11 大于 v3.0.0-beta.5
        tags.sort((a, b) => {
            const getRank = (v) => {
                // 提取数字部分进行比较
                const parts = v.replace(/^v/, '').split(/[.-]/);
                return parts.map(p => {
                    const n = parseInt(p, 10);
                    return isNaN(n) ? p : n;
                });
            };
            const rankA = getRank(a);
            const rankB = getRank(b);
            
            // 逐位比较
            for (let i = 0; i < Math.max(rankA.length, rankB.length); i++) {
                const vA = rankA[i];
                const vB = rankB[i];
                if (vA === undefined) return -1;
                if (vB === undefined) return 1;
                if (typeof vA !== typeof vB) return typeof vA === 'number' ? 1 : -1;
                if (vA !== vB) return vA > vB ? 1 : -1;
            }
            return 0;
        }).reverse(); // 降序排列，最新版排在最上面
        
        // 3. 始终把 HEAD (主分支最新) 放在最前面
        const availableVersions = ['HEAD', ...tags];
        const latestVersion = tags[0] || 'HEAD';

        return {
            hasUpdate: localVersion !== latestVersion,
            localVersion,
            latestVersion,
            availableVersions,
            updateMethod: 'git-tags',
            error: null
        };
    } catch (error) {
        logger.error('[Update] Failed to fetch tags:', error.message);
        return {
            hasUpdate: false,
            localVersion,
            latestVersion: localVersion,
            availableVersions: ['HEAD'],
            updateMethod: 'git',
            error: error.message
        };
    }
}

/**
 * 执行更新操作
 */
export async function performUpdate(targetTag = null) {
    const target = targetTag || 'HEAD';
    logger.info(`[Update] Manual update triggered. Target: ${target}`);

    try {
        // 1. 获取最新代码
        await execAsync('git fetch --all --tags --force');
        
        if (target === 'HEAD') {
            logger.info('[Update] Switching to origin/main (HEAD)...');
            await execAsync('git reset --hard origin/main');
        } else {
            logger.info(`[Update] Checking out tag: ${target}...`);
            await execAsync(`git checkout ${target}`);
            // 如果是 Tag，建议 reset --hard 确保干净
            await execAsync(`git reset --hard ${target}`);
        }

        // 2. 检查依赖
        logger.info('[Update] Running npm install...');
        // 极速模式下使用 --production
        await execAsync('npm install --production');

        // 3. 更新 VERSION 文件 (如果是 checkout tag)
        if (target !== 'HEAD') {
            const versionFilePath = path.join(process.cwd(), 'VERSION');
            writeFileSync(versionFilePath, target.replace(/^v/, ''));
        }

        // 4. 准备重启
        logger.info('[Update] Update successful, triggering service restart...');
        
        // 触发 Master 进程热重启
        setTimeout(() => {
            const masterPort = process.env.MASTER_PORT || 3100;
            logger.info(`[Update] Requesting restart on master port ${masterPort}...`);
            // 使用内部调用的方式通知 Master 重启
            axios.post(`http://127.0.0.1:${masterPort}/master/restart`).catch(err => {
                logger.warn('[Update] Auto-restart notification failed, manual restart may be required.');
            });
        }, 3000);

        return {
            success: true,
            message: `Successfully updated to ${target}. Service is restarting...`,
            updated: true,
            target: target
        };
    } catch (error) {
        logger.error('[Update] Update failed:', error.message);
        return {
            success: false,
            message: `Update failed: ${error.message}`,
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
        const targetTag = body?.tag || body?.version;
        const updateResult = await performUpdate(targetTag);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updateResult));
        return true;
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
        return true;
    }
}
