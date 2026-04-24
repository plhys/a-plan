/**
 * 主进程 (Master Process)
 * 
 * 负责管理子进程的生命周期，包括：
 * - 启动子进程
 * - 监控子进程状态
 * - 处理子进程重启请求
 * - 提供 IPC 通信
 * 
 * 使用方式：
 * node src/core/master.js [原有的命令行参数]
 */

import { fork } from 'child_process';
import os from 'os';
import fs from 'fs';
import logger from '../utils/logger.js';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { isRetryableNetworkError } from '../utils/common.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取版本号
let appVersion = '4.2.7';
try {
    const versionFilePath = path.join(process.cwd(), 'VERSION');
    if (fs.existsSync(versionFilePath)) {
        appVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
    }
} catch (error) {
    logger.warn('[Master] Failed to read VERSION file:', error.message);
}

// 子进程实例映射
let workerProcesses = new Map();

// 子进程状态汇总
let globalWorkerStatus = {
    restartCount: 0,
    lastRestartTime: null,
    isRestarting: false
};

// 配置
const config = {
    workerScript: path.join(__dirname, '../services/api-server.js'),
    maxRestartAttempts: 10,
    restartDelay: 1000, // 重启延迟（毫秒）
    masterPort: parseInt(process.env.MASTER_PORT) || 3100, // 主进程管理端口
    workerCount: parseInt(process.env.WORKER_COUNT) || 1, // 默认 1 个 worker，可设为 'auto' 或指定数字
    args: process.argv.slice(2) // 传递给子进程的参数
};

/**
 * 获取 CPU 核心数
 */
function getWorkerCount() {
    if (config.workerCount === 'auto') {
        return Math.max(1, os.cpus().length);
    }
    return Math.max(1, parseInt(config.workerCount));
}

/**
 * 启动一个子进程
 * @param {number} index - 子进程索引
 */
function startWorker(index = 0) {
    if (workerProcesses.has(index)) {
        logger.info(`[Master] Worker ${index} already running`);
        return;
    }

    logger.info(`[Master] Starting worker ${index}...`);
    
    const worker = fork(config.workerScript, config.args, {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: {
            ...process.env,
            IS_WORKER_PROCESS: 'true',
            WORKER_ID: index,
            APP_VERSION: appVersion
        }
    });

    workerProcesses.set(index, {
        instance: worker,
        pid: worker.pid,
        startTime: new Date().toISOString()
    });

    logger.info(`[Master] Worker ${index} started, PID:`, worker.pid);

    // 监听子进程消息
    worker.on('message', (message) => {
        // logger.info(`[Master] Received message from worker ${index}:`, message);
        handleWorkerMessage(index, message);
    });

    // 监听子进程退出
    worker.on('exit', (code, signal) => {
        logger.info(`[Master] Worker ${index} exited with code ${code}, signal ${signal}`);
        workerProcesses.delete(index);

        // 如果不是主动重启导致的退出，尝试自动重启
        if (!globalWorkerStatus.isRestarting && code !== 0) {
            logger.info(`[Master] Worker ${index} crashed, attempting auto-restart...`);
            scheduleRestart(index);
        }
    });

    // 监听子进程错误
    worker.on('error', (error) => {
        logger.error(`[Master] Worker ${index} process error:`, error.message);
    });
}

/**
 * 启动所有子进程
 */
function startAllWorkers() {
    const count = getWorkerCount();
    logger.info(`[Master] Spawning ${count} worker(s)...`);
    for (let i = 0; i < count; i++) {
        startWorker(i);
    }
}

/**
 * 停止指定或所有子进程
 * @param {number|null} index - 子进程索引，null 表示所有
 * @param {boolean} graceful - 是否优雅关闭
 * @returns {Promise<void>}
 */
async function stopWorkers(index = null, graceful = true) {
    const targets = index !== null ? [index] : Array.from(workerProcesses.keys());
    
    const stopPromises = targets.map(idx => {
        return new Promise((resolve) => {
            const workerInfo = workerProcesses.get(idx);
            if (!workerInfo) {
                resolve();
                return;
            }

            const worker = workerInfo.instance;
            logger.info(`[Master] Stopping worker ${idx}, PID:`, worker.pid);

            const timeout = setTimeout(() => {
                if (workerProcesses.has(idx)) {
                    logger.info(`[Master] Force killing worker ${idx}...`);
                    worker.kill('SIGKILL');
                }
                resolve();
            }, 5000);

            worker.once('exit', () => {
                clearTimeout(timeout);
                workerProcesses.delete(idx);
                logger.info(`[Master] Worker ${idx} stopped`);
                resolve();
            });

            if (graceful) {
                worker.send({ type: 'shutdown' });
                worker.kill('SIGTERM');
            } else {
                worker.kill('SIGKILL');
            }
        });
    });

    await Promise.all(stopPromises);
}

/**
 * 重启所有子进程
 * @returns {Promise<Object>}
 */
async function restartAllWorkers() {
    if (globalWorkerStatus.isRestarting) {
        return { success: false, message: 'Restart already in progress' };
    }

    globalWorkerStatus.isRestarting = true;
    globalWorkerStatus.restartCount++;
    globalWorkerStatus.lastRestartTime = new Date().toISOString();

    logger.info('[Master] Restarting all worker processes...');

    try {
        await stopWorkers(null, true);
        await new Promise(resolve => setTimeout(resolve, config.restartDelay));
        startAllWorkers();
        globalWorkerStatus.isRestarting = false;

        return {
            success: true,
            message: 'All workers restarted successfully',
            restartCount: globalWorkerStatus.restartCount
        };
    } catch (error) {
        globalWorkerStatus.isRestarting = false;
        logger.error('[Master] Failed to restart workers:', error.message);
        return {
            success: false,
            message: 'Failed to restart workers: ' + error.message
        };
    }
}

/**
 * 计划重启
 */
function scheduleRestart(index) {
    if (globalWorkerStatus.restartCount >= config.maxRestartAttempts) {
        logger.error('[Master] Max restart attempts reached, giving up');
        return;
    }

    const delay = Math.min(config.restartDelay * Math.pow(2, globalWorkerStatus.restartCount), 30000);
    logger.info(`[Master] Scheduling restart for worker ${index} in ${delay}ms...`);

    setTimeout(() => {
        startWorker(index);
    }, delay);
}

/**
 * 处理消息
 */
function handleWorkerMessage(index, message) {
    if (!message || !message.type) return;

    switch (message.type) {
        case 'ready':
            logger.info(`[Master] Worker ${index} is ready`);
            break;
        case 'restart_request':
            logger.info(`[Master] Worker ${index} requested restart`);
            restartAllWorkers();
            break;
        case 'status':
            // logger.info(`[Master] Worker ${index} status:`, message.data);
            break;
        default:
            // logger.info(`[Master] Unknown message type from worker ${index}:`, message.type);
    }
}

/**
 * 获取状态信息
 */
function getStatus() {
    const workers = [];
    workerProcesses.forEach((info, index) => {
        workers.push({
            id: index,
            pid: info.pid,
            startTime: info.startTime
        });
    });

    return {
        master: {
            pid: process.pid,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            workerCount: workers.length,
            targetWorkerCount: getWorkerCount()
        },
        workers: workers,
        stats: {
            restartCount: globalWorkerStatus.restartCount,
            lastRestartTime: globalWorkerStatus.lastRestartTime,
            isRestarting: globalWorkerStatus.isRestarting
        }
    };
}

/**
 * 创建主进程管理 HTTP 服务器
 */
function createMasterServer() {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;
        const method = req.method;

        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // 状态端点
        if (method === 'GET' && path === '/master/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(getStatus()));
            return;
        }

        // 重启端点
        if (method === 'POST' && path === '/master/restart') {
            logger.info('[Master] Restart requested via API');
            const result = await restartAllWorkers();
            res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // 停止端点
        if (method === 'POST' && path === '/master/stop') {
            logger.info('[Master] Stop requested via API');
            await stopWorkers(null, true);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'All workers stopped' }));
            return;
        }

        // 启动端点
        if (method === 'POST' && path === '/master/start') {
            logger.info('[Master] Start requested via API');
            if (workerProcesses.size > 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Workers already running' }));
                return;
            }
            startAllWorkers();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Workers started' }));
            return;
        }

        // 健康检查
        if (method === 'GET' && path === '/master/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'healthy',
                workerCount: workerProcesses.size,
                timestamp: new Date().toISOString()
            }));
            return;
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    });

    server.listen(config.masterPort, () => {
        logger.info(`[Master] Management server listening on port ${config.masterPort}`);
        logger.info(`[Master] Available endpoints:`);
        logger.info(`  GET  /master/status  - Get master and workers status`);
        logger.info(`  GET  /master/health  - Health check`);
        logger.info(`  POST /master/restart - Restart all worker processes`);
        logger.info(`  POST /master/stop    - Stop all worker processes`);
        logger.info(`  POST /master/start   - Start all worker processes`);
    });

    return server;
}

/**
 * 处理进程信号
 */
function setupSignalHandlers() {
    // 优雅关闭
    process.on('SIGTERM', async () => {
        logger.info('[Master] Received SIGTERM, shutting down...');
        await stopWorkers(null, true);
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        logger.info('[Master] Received SIGINT, shutting down...');
        await stopWorkers(null, true);
        process.exit(0);
    });

    // 未捕获的异常
    process.on('uncaughtException', (error) => {
        logger.error('[Master] Uncaught exception:', error);
        
        // 检查是否为可重试的网络错误
        if (isRetryableNetworkError(error)) {
            logger.warn('[Master] Network error detected, continuing operation...');
            return; // 不退出程序，继续运行
        }
        
        // 对于其他严重错误，记录但不退出（由主进程管理子进程）
        logger.error('[Master] Fatal error detected in master process');
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('[Master] Unhandled rejection at:', promise, 'reason:', reason);
        
        // 检查是否为可重试的网络错误
        if (reason && isRetryableNetworkError(reason)) {
            logger.warn('[Master] Network error in promise rejection, continuing operation...');
            return; // 不退出程序，继续运行
        }
    });
}

/**
 * 主函数
 */
async function main() {
    logger.info('='.repeat(50));
    logger.info('[Master] A-Plan Master Process (Multi-Worker)');
    logger.info('[Master] PID:', process.pid);
    logger.info('[Master] Node version:', process.version);
    logger.info('[Master] CPU Cores:', os.cpus().length);
    logger.info('[Master] Working directory:', process.cwd());
    logger.info('='.repeat(50));

    // 设置信号处理
    setupSignalHandlers();

    // 创建管理服务器
    createMasterServer();

    // 启动子进程
    startAllWorkers();
}

// 启动主进程
main().catch(error => {
    logger.error('[Master] Failed to start:', error);
    process.exit(1);
});