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
    initClashManager
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
    initClashManager();
    
    // 初始化 Clash 模块控制 (内建)
    initClashModuleControl();
    
    window.customModelsManager = new CustomModelsManager();
    initMobileMenu();
    loadInitialData();
    
    // 定时刷新显示
    setInterval(updateTimeDisplay, 5000);
    setInterval(loadProviders, REFRESH_INTERVALS.SYSTEM_INFO);
}

/**
 * 初始化 Clash 模块开关逻辑 (内建)
 */
async function initClashModuleControl() {
    try {
        const data = await window.apiClient.get('/clash/info');
        const toggle = document.getElementById('clashModuleToggle');
        if (toggle) {
            toggle.checked = !!data.config.enabled;
        }
    } catch (e) {
        console.error('[Clash] 状态同步失败:', e);
    }
}

/**
 * 处理 Clash 模块开关切换
 */
window.handleClashModuleToggle = async function(enabled) {
    const toggle = document.getElementById('clashModuleToggle');
    try {
        await window.apiClient.post('/clash/config', { enabled });
        showToast(enabled ? '模块已插入' : '模块已拔出', '核心状态已异步更新', 'success');
        
        // 静默更新 UI
        if (typeof window.updateClashUIState === 'function') {
            await window.updateClashUIState();
        }
    } catch (e) {
        showToast('操作失败', e.message, 'error');
        toggle.checked = !enabled;
    }
};

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
