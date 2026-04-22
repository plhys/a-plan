import { existsSync, readFileSync, writeFileSync } from 'fs';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { CONFIG } from '../core/config-manager.js';
import { getRequestBody } from '../utils/common.js';

const execAsync = promisify(exec);
const GITHUB_REPO = 'plhys/a-plan';

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
    let localVersion = '4.2.7'; // 默认保底
    try {
        if (existsSync(versionFilePath)) {
            // 强制实时读取磁盘文件，确保 UI 显示的永远是磁盘上的真相
            localVersion = readFileSync(versionFilePath, 'utf-8').trim();
        }
    } catch (e) {
        logger.error('[Update] Error reading VERSION file:', e.message);
    }

    try {
        // 1. 尝试静默获取远程信息，但不阻塞本地版本显示
        await execAsync('git fetch --tags').catch(() => {});
        
        const { stdout } = await execAsync('git tag -l');
        let tags = stdout.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        
        // ... (排序逻辑保持不变)
        tags.sort((a, b) => {
            const parseVersion = (v) => {
                const parts = v.replace(/^v/, '').split(/[.-]/);
                return parts.map(p => {
                    const n = parseInt(p, 10);
                    return isNaN(n) ? p : n;
                });
            };
            const vA = parseVersion(a);
            const vB = parseVersion(b);
            const maxLen = Math.max(vA.length, vB.length);
            for (let i = 0; i < maxLen; i++) {
                const pA = vA[i];
                const pB = vB[i];
                if (pA === undefined) return -1;
                if (pB === undefined) return 1;
                if (typeof pA !== typeof pB) return typeof pA === 'number' ? 1 : -1;
                if (pA > pB) return 1;
                if (pA < pB) return -1;
            }
            return 0;
        }).reverse();

        // --- 诚实的版本检查逻辑 ---
        const latestTag = tags[0] || 'HEAD';
        const availableVersions = [...tags, 'HEAD'];

        // 仅当远程 Tag 确实大于本地时，才认为有更新
        const hasUpdate = compareVersions(latestTag, localVersion) > 0;

        return {
            hasUpdate,
            localVersion,
            latestVersion: latestTag,
            availableVersions,
            updateMethod: 'git-tags-hard'
        };

        return {
            hasUpdate,
            localVersion, // 这就是 UI 渲染的来源
            latestVersion,
            availableVersions,
            updateMethod: 'git-tags-hard'
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
        // 1. 获取最新代码并强制同步
        await execAsync('git fetch --all --tags --force');
        
        if (target === 'HEAD') {
            logger.info('[Update] Switching to origin/main (HEAD)...');
            await execAsync('git fetch origin main');
            await execAsync('git reset --hard origin/main');
        } else {
            logger.info(`[Update] Checking out and resetting to tag: ${target}...`);
            // 极客加固：强制清理本地改动，防止 checkout 失败
            await execAsync('git reset --hard');
            await execAsync('git clean -fd'); 
            await execAsync(`git checkout ${target}`);
            await execAsync(`git reset --hard ${target}`);
        }

        // 2. 补全生产依赖 (静默、安全)
        logger.info('[Update] Synchronizing dependencies...');
        await execAsync('npm install --production');

        // 3. 准备重启
        logger.info('[Update] Core synchronized. Notifying Master for zero-downtime reload...');
        
        // 触发 Master 进程热重启
        setTimeout(() => {
            const masterPort = process.env.MASTER_PORT || 3100;
            axios.post(`http://127.0.0.1:${masterPort}/master/restart`).catch(err => {
                logger.warn('[Update] Master notify failed, manual restart recommended.');
            });
        }, 3000);

        return {
            success: true,
            message: `Successfully synchronized to ${target}. Warming up workers...`,
            updated: true,
            target: target
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
