// 主应用入口文件 - 模块化极客修复版

// 导入所有模块
import {
    providerStats,
    REFRESH_INTERVALS,
    elements
} from './constants.js';

import {
    showToast,
    getProviderStats
} from './utils.js';

import { t } from './i18n.js';

import {
    initFileUpload
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
    reloadConfig
} from './upload-config-manager.js';

import {
    initUsageManager
} from './usage-manager.js';

import {
    initImageZoom
} from './image-zoom.js';

import {
    initPluginManager
} from './plugin-manager.js';

import {
    initTutorialManager
} from './tutorial-manager.js';

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

// 初始化应用逻辑
export function initApp() {
    // 设置加载器
    setDataLoaders(loadInitialData, saveConfiguration);
    setReloadConfig(reloadConfig);
    setProviderLoaders(loadProviders, refreshProviderConfig);
    setConfigLoaders(loadConfigList);
    
    // 初始化核心组件
    initNavigation();
    initEventListeners();
    initEventStream();
    
    // 初始化功能模块
    initFileUpload();
    initRoutingExamples();
    initUploadConfigManager();
    initUsageManager();
    initImageZoom();
    initPluginManager();
    initTutorialManager();
    
    window.customModelsManager = new CustomModelsManager();
    initMobileMenu();
    loadInitialData();
    
    // 定时刷新显示
    setInterval(updateTimeDisplay, 5000);
    setInterval(loadProviders, REFRESH_INTERVALS.SYSTEM_INFO);
}

/**
 * 移动端菜单
 */
function initMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const header = document.getElementById('headerControls');
    if (!toggle || !header) return;
    toggle.addEventListener('click', () => {
        const isHidden = header.style.display === 'none';
        header.style.display = isHidden ? 'flex' : 'none';
        toggle.innerHTML = isHidden ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
    });
}

// 导出全局函数
window.initApp = initApp;
window.loadProviders = loadProviders;
window.openProviderManager = openProviderManager;
window.showProviderManagerModal = showProviderManagerModal;
window.refreshProviderConfig = refreshProviderConfig;
window.generateApiKey = generateApiKey;
window.reloadConfig = reloadConfig;
