import { existsSync } from 'fs';
import logger from '../utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { addToUsedPaths, isPathUsed, pathsEqual } from '../utils/provider-utils.js';

/**
 * 扫描和分析配置文件
 * 注意：当前仅支持 OpenAI Custom，移除了 OAuth 凭据管理功能
 * @param {Object} currentConfig - The current configuration object
 * @param {Object} providerPoolManager - Provider pool manager instance
 * @returns {Promise<Array>} Array of configuration file objects
 */
export async function scanConfigFiles(currentConfig, providerPoolManager) {
    const configFiles = [];
    
    // 只扫描configs目录
    const configsPath = path.join(process.cwd(), 'configs');
    
    if (!existsSync(configsPath)) {
        return configFiles;
    }

    const usedPaths = new Set();

    // 使用最新的提供商池数据
    let providerPools = currentConfig.providerPools;
    if (providerPoolManager && providerPoolManager.providerPools) {
        providerPools = providerPoolManager.providerPools;
    }

    // 当前仅支持 OpenAI Custom，不扫描 OAuth 凭据文件
    try {
        // 扫描 configs 目录下的所有子目录和文件
        const entries = await fs.readdir(configsPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(configsPath, entry.name);
            const relativePath = path.relative(process.cwd(), fullPath);
            
            if (entry.isFile() && entry.name.endsWith('.json')) {
                try {
                    const content = await fs.readFile(fullPath, 'utf8');
                    const jsonData = JSON.parse(content);
                    
                    // 只扫描 provider_pools.json 和 custom_models.json
                    if (entry.name === 'provider_pools.json' || entry.name === 'custom_models.json') {
                        configFiles.push({
                            filePath: relativePath,
                            fileName: entry.name,
                            size: (await fs.stat(fullPath)).size,
                            type: 'config',
                            isValid: true,
                            lastModified: (await fs.stat(fullPath)).mtime
                        });
                    }
                } catch (e) {
                    // 忽略无效的 JSON 文件
                }
            }
        }
    } catch (error) {
        logger.warn(`[Config Scanner] Failed to scan configs directory:`, error.message);
    }

    return configFiles;
}

/**
 * 扫描 OAuth 目录（已废弃，仅保留空函数以避免运行时错误）
 * @param {string} directoryPath - 目录路径
 * @param {Set} usedPaths - 已使用路径集合
 * @param {Object} currentConfig - 当前配置
 * @returns {Promise<Array>} 空数组
 */
export async function scanOAuthDirectory(directoryPath, usedPaths, currentConfig) {
    return [];
}

/**
 * 分析 OAuth 配置文件（已废弃）
 * @param {string} filePath - 文件路径
 * @param {Set} usedPaths - 已使用路径集合
 * @param {Object} currentConfig - 当前配置
 * @returns {Promise<null>} null
 */
export async function analyzeOAuthFile(filePath, usedPaths, currentConfig) {
    return null;
}

/**
 * 获取配置目录信息（已废弃）
 * @param {string} directoryPath - 目录路径
 * @returns {Promise<Array>} 空数组
 */
export async function getOAuthDirectoryInfo(directoryPath) {
    return [];
}