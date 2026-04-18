// 主应用入口文件 - 模块化版本

// 导入所有模块
import {
    providerStats,
    REFRESH_INTERVALS
} from './constants.js';

import {
    showToast,
    getProviderStats
} from './utils.js';

import { t } from './i18n.js';

import {
    initFileUpload,
    fileUploadHandler
} from './file-upload.js';

import { 
    initNavigation 
} from './navigation.js';

import {
    initEventListeners,
    setDataLoaders,
    setReloadConfig
} from './event-handlers.js';

import {
    initEventStream,
    setProviderLoaders,
    setConfigLoaders
} from './event-stream.js';

import {
    loadSystemInfo,
    updateTimeDisplay,
    loadProviders,
    openProviderManager,
    showAuthModal,
    executeGenerateAuthUrl,
    handleGenerateAuthUrl,
    showAddProviderGroupModal
} from './provider-manager.js';

import {
    loadConfiguration,
    saveConfiguration,
    generateApiKey
} from './config-manager.js';

import {
    showProviderManagerModal,
    refreshProviderConfig
} from './modal.js';

import {
    initRoutingExamples
} from './routing-examples.js';

import {
    initUploadConfigManager,
    loadConfigList,
    viewConfig,
    deleteConfig,
    closeConfigModal,
    copyConfigContent,
    reloadConfig
} from './upload-config-manager.js';

import {
    initUsageManager,
    refreshUsage
} from './usage-manager.js';

import {
    initImageZoom
} from './image-zoom.js';

import {
    initPluginManager,
    togglePlugin
} from './plugin-manager.js';

import {
    initTutorialManager
} from './tutorial-manager.js';

import {
    initClashManager,
    updateClashUIState
} from './clash-manager.js';

import {
    CustomModelsManager
} from './custom-models-manager.js';

/**
 * 加载初始数据
 */
function loadInitialData() {
    loadSystemInfo();
    loadProviders();
    loadConfiguration();
    if (window.customModelsManager) {
        window.customModelsManager.load();
    }
}

// 初始化应用逻辑（被 index.html 显式调用以确保顺序）
export function initApp() {
    // 设置数据加载器
    setDataLoaders(loadInitialData, saveConfiguration);
    
    // 设置reloadConfig函数
    setReloadConfig(reloadConfig);
    
    // 设置提供商加载器
    setProviderLoaders(loadProviders, refreshProviderConfig);
    
    // 设置配置加载器
    setConfigLoaders(loadConfigList);
    
    // 初始化各个模块
    initNavigation();
    initEventListeners();
    initEventStream();
    initFileUpload(); // 初始化文件上传功能
    initRoutingExamples(); // 初始化路径路由示例功能
    initUploadConfigManager(); // 初始化配置管理功能
    initUsageManager(); // 初始化用量管理功能
    initImageZoom(); // 初始化图片放大功能
    initPluginManager(); // 初始化插件管理功能
    initTutorialManager(); // 初始化教程管理功能
    initClashManager(); // 初始化 Clash 管理功能
    
    // 初始化 Clash 原子开关逻辑
    initClashAtomicControl();
    
    // 初始化自定义模型管理
    window.customModelsManager = new CustomModelsManager();
    
    initMobileMenu(); // 初始化移动端菜单
    loadInitialData();
    
    // 显示欢迎消息
    showToast(t('common.success'), t('common.welcome'), 'success');
    
    // 每5秒更新服务器时间和运行时间显示
    setInterval(() => {
        updateTimeDisplay();
    }, 5000);
    
    // 定期刷新系统信息
    setInterval(() => {
        loadProviders();

        if (providerStats.activeProviders > 0) {
            const stats = getProviderStats(providerStats);
            console.log('=== 提供商统计报告 ===');
            console.log(`活跃提供商: ${stats.activeProviders}`);
            console.log(`健康提供商: ${stats.healthyProviders} (${stats.healthRatio})`);
            console.log(`总账户数: ${stats.totalAccounts}`);
            console.log(`总请求数: ${stats.totalRequests}`);
            console.log(`总错误数: ${stats.totalErrors}`);
            console.log(`成功率: ${stats.successRate}`);
            console.log(`平均每提供商请求数: ${stats.avgUsagePerProvider}`);
            console.log('========================');
        }
    }, REFRESH_INTERVALS.SYSTEM_INFO);

}

/**
 * 初始化移动端菜单
 */
function initMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const headerControls = document.getElementById('headerControls');
    
    if (!mobileMenuToggle || !headerControls) {
        console.log('Mobile menu elements not found');
        return;
    }
    
    // 默认隐藏header-controls
    headerControls.style.display = 'none';
    
    let isMenuOpen = false;
    
    mobileMenuToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Mobile menu toggle clicked, current state:', isMenuOpen);
        
        isMenuOpen = !isMenuOpen;
        
        if (isMenuOpen) {
            headerControls.style.display = 'flex';
            mobileMenuToggle.innerHTML = '<i class="fas fa-times"></i>';
            console.log('Menu opened');
        } else {
            headerControls.style.display = 'none';
            mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
            console.log('Menu closed');
        }
    });
    
    // 点击页面其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (isMenuOpen && !mobileMenuToggle.contains(e.target) && !headerControls.contains(e.target)) {
            isMenuOpen = false;
            headerControls.style.display = 'none';
            mobileMenuToggle.innerHTML = '<i class="fas fa-bars"></i>';
            console.log('Menu closed by clicking outside');
        }
    });
}

/**
 * 初始化 Clash 原子开关控制
 */
async function initClashAtomicControl() {
    try {
        // 【修正】改用 apiClient 解决 401 导致的刷新后开关复位问题
        const data = await window.apiClient.get('/plugins');
        const plugins = data.plugins || [];
        const plugin = plugins.find(p => p.name === 'clash-guardian');
        
        const toggle = document.getElementById('clashAtomicToggle');
        if (toggle) {
            const isActive = !!(plugin && plugin.installed && plugin.enabled);
            toggle.checked = isActive;
            console.log('[Clash] 侧边栏开关初始化成功:', isActive);
            
            if (isActive && window.updateClashUIState) {
                window.updateClashUIState();
            }
        }
    } catch (e) {
        console.error('[Clash] 初始化开关失败 (Auth Error?):', e);
    }
}

/**
 * 处理 Clash 原子开关切换
 */
window.handleClashAtomicToggle = async function(enabled) {
    const toggle = document.getElementById('clashAtomicToggle');
    // 使用项目内置的 apiClient 以自动携带认证 Token
    const client = window.apiClient; 
    
    try {
        if (enabled) {
            console.log('[Clash] 正在激活模块...');
            // 1. 安装
            await client.post('/plugins/clash-guardian/install');
            // 2. 启用
            await client.post('/plugins/clash-guardian/toggle', { enabled: true });
            
            showToast('激活成功', '代理模块已加载', 'success');
        } else {
            console.log('[Clash] 正在停用模块...');
            // 1. 禁用
            await client.post('/plugins/clash-guardian/toggle', { enabled: false });
            // 2. 卸载
            await client.delete('/plugins/clash-guardian/uninstall');
            
            showToast('停用成功', '模块已彻底移除', 'success');
        }
        
        setTimeout(() => {
            console.log('[Clash] 锁定锚点并刷新');
            window.location.hash = 'clash';
            location.reload();
        }, 800);
    } catch (e) {
        console.error('[Clash] 开关操作失败:', e);
        showToast('操作失败', e.message, 'error');
        toggle.checked = !enabled; 
    }
};

// 导出供外部使用的函数
window.initApp = initApp;
window.loadProviders = loadProviders;
window.openProviderManager = openProviderManager;
window.showProviderManagerModal = showProviderManagerModal;
window.refreshProviderConfig = refreshProviderConfig;
window.fileUploadHandler = fileUploadHandler;
window.showAuthModal = showAuthModal;
window.executeGenerateAuthUrl = executeGenerateAuthUrl;
window.handleGenerateAuthUrl = handleGenerateAuthUrl;
window.showAddProviderGroupModal = showAddProviderGroupModal;

// 配置管理相关全局函数
window.viewConfig = viewConfig;
window.deleteConfig = deleteConfig;
window.loadConfigList = loadConfigList;
window.closeConfigModal = closeConfigModal;
window.copyConfigContent = copyConfigContent;
window.reloadConfig = reloadConfig;
window.generateApiKey = generateApiKey;

// 用量管理相关全局函数
window.refreshUsage = refreshUsage;

// 插件管理相关全局函数
window.togglePlugin = togglePlugin;

// 导出调试函数
window.getProviderStats = () => getProviderStats(providerStats);

console.log('A计划 管理控制台已加载 - 模块化版本');
