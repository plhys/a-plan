import { t } from './i18n.js';
import { showToast, apiRequest } from './utils.js';

// 插件列表状态
let pluginsList = [];

/**
 * 初始化插件管理器
 */
export function initPluginManager() {
    const refreshBtn = document.getElementById('refreshPluginsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadPlugins);
    }
    
    // 注入全局函数以便在 HTML 中使用
    window.togglePlugin = togglePlugin;
    window.installPlugin = installPlugin;
    window.uninstallPlugin = uninstallPlugin;
    
    // 初始加载
    loadPlugins();
}

/**
 * 加载插件列表
 */
export async function loadPlugins() {
    const loadingEl = document.getElementById('pluginsLoading');
    const emptyEl = document.getElementById('pluginsEmpty');
    const listEl = document.getElementById('pluginsList');
    const totalEl = document.getElementById('totalPlugins');
    const enabledEl = document.getElementById('enabledPlugins');
    const disabledEl = document.getElementById('disabledPlugins');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';
    
    try {
        const response = await apiRequest('/api/plugins');
        
        if (response && response.plugins) {
            pluginsList = response.plugins;
            renderPluginsList();
            
            // 更新统计信息
            if (totalEl) totalEl.textContent = pluginsList.length;
            if (enabledEl) enabledEl.textContent = pluginsList.filter(p => p.installed && p.enabled).length;
            if (disabledEl) disabledEl.textContent = pluginsList.filter(p => p.installed && !p.enabled).length;
        } else {
            if (emptyEl) emptyEl.style.display = 'flex';
        }
    } catch (error) {
        console.error('Failed to load plugins:', error);
        showToast(t('common.error'), t('plugins.load.failed'), 'error');
        if (emptyEl) emptyEl.style.display = 'flex';
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

/**
 * 渲染插件列表
 */
function renderPluginsList() {
    const listEl = document.getElementById('pluginsList');
    const emptyEl = document.getElementById('pluginsEmpty');
    
    if (!listEl) return;

    listEl.innerHTML = '';
    
    if (pluginsList.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    pluginsList.forEach(plugin => {
        const card = document.createElement('div');
        card.className = `plugin-card ${plugin.installed ? (plugin.enabled ? 'enabled' : 'disabled') : 'uninstalled'}`;
        
        // 构建标签 HTML
        let badgesHtml = '';
        if (plugin.installed) {
            if (plugin.hasMiddleware) badgesHtml += `<span class="plugin-badge middleware">Middleware</span>`;
            if (plugin.hasRoutes) badgesHtml += `<span class="plugin-badge routes">Routes</span>`;
        } else {
            badgesHtml += `<span class="plugin-badge market">Marketplace</span>`;
        }
        
        // 构建操作按钮
        let actionHtml = '';
        if (plugin.installed) {
            actionHtml = `
                <div class="plugin-actions">
                    <label class="toggle-switch">
                        <input type="checkbox" ${plugin.enabled ? 'checked' : ''} onchange="window.togglePlugin('${plugin.name}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="btn-icon delete" onclick="window.uninstallPlugin('${plugin.name}')" title="卸载插件">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        } else {
            actionHtml = `
                <div class="plugin-actions">
                    <button class="btn btn-primary btn-sm" onclick="window.installPlugin('${plugin.name}')">
                        <i class="fas fa-download"></i> 安装
                    </button>
                </div>
            `;
        }
        
        // 插件直达页面映射
        const pluginRoutes = {
            'api-potluck': [
                { name: 'API Potluck', path: '/potluck.html', icon: 'fa-key' },
                { name: '用户门户', path: '/potluck-user.html', icon: 'fa-user' }
            ],
            'model-usage-stats': [
                { name: '用量统计', path: '/model-usage-stats.html', icon: 'fa-chart-bar' }
            ]
        };
        
        // 构建直达链接 HTML
        let directLinksHtml = '';
        if (plugin.installed && plugin.enabled && pluginRoutes[plugin.name]) {
            directLinksHtml = pluginRoutes[plugin.name].map(route => 
                `<a href="${route.path}" target="_blank" class="plugin-badge routes" style="text-decoration:none;cursor:pointer;"><i class="fas ${route.icon}"></i> ${route.name}</a>`
            ).join('');
        }
        
        card.innerHTML = `
            <div class="plugin-header">
                <div class="plugin-title">
                    <h3>${plugin.displayName || plugin.name}</h3>
                    <span class="plugin-version">v${plugin.version}</span>
                </div>
                ${actionHtml}
            </div>
            <div class="plugin-description">${plugin.description || t('plugins.noDescription')}</div>
            <div class="plugin-badges">
                ${badgesHtml}
                ${directLinksHtml}
            </div>
            <div class="plugin-status">
                <i class="fas fa-circle"></i> 
                <span>${plugin.installed ? (plugin.enabled ? t('plugins.status.enabled') : t('plugins.status.disabled')) : '尚未安装'}</span>
            </div>
        `;
        
        listEl.appendChild(card);
    });
}

/**
 * 切换插件启用状态
 */
export async function togglePlugin(pluginName, enabled) {
    try {
        await apiRequest(`/api/plugins/${encodeURIComponent(pluginName)}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ enabled })
        });
        
        showToast(t('common.success'), t('plugins.toggle.success', { name: pluginName, status: enabled ? t('common.enabled') : t('common.disabled') }), 'success');
        loadPlugins();
        showToast(t('common.info'), t('plugins.restart.required'), 'info');
    } catch (error) {
        console.error(`Failed to toggle plugin ${pluginName}:`, error);
        showToast(t('common.error'), t('plugins.toggle.failed'), 'error');
        loadPlugins();
    }
}

/**
 * 安装插件
 */
export async function installPlugin(pluginName) {
    try {
        showToast('正在安装', `Installing ${pluginName}...`, 'info');
        await apiRequest(`/api/plugins/${encodeURIComponent(pluginName)}/install`, {
            method: 'POST'
        });
        
        showToast(t('common.success'), `Plugin ${pluginName} Installed!`, 'success');
        loadPlugins();
        showToast(t('common.info'), '请在启用插件后重启服务。', 'info');
    } catch (error) {
        console.error(`Failed to install plugin ${pluginName}:`, error);
        showToast(t('common.error'), `Failed: ${error.message}`, 'error');
    }
}

/**
 * 卸载插件
 */
export async function uninstallPlugin(pluginName) {
    if (!confirm(`Uninstall ${pluginName}?`)) {
        return;
    }
    
    try {
        await apiRequest(`/api/plugins/${encodeURIComponent(pluginName)}/uninstall`, {
            method: 'DELETE'
        });
        
        showToast(t('common.success'), `Plugin ${pluginName} Uninstalled.`, 'success');
        loadPlugins();
    } catch (error) {
        console.error(`Failed to uninstall plugin ${pluginName}:`, error);
        showToast(t('common.error'), `Uninstall Failed: ${error.message}`, 'error');
    }
}
