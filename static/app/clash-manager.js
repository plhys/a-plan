
/**
 * Clash 代理管理逻辑 - 2.9.1 极客分流版
 */
import { showToast } from './utils.js';

export async function initClashManager() {
    window.updateClashUIState = loadClashDetails;
    window.saveClashSettings = saveClashSettings;
    window.updateProviderRoute = updateProviderRoute;
    
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && navItem.dataset.section === 'clash') {
            loadClashDetails();
        }
    });
    loadClashDetails();
}

async function loadClashDetails() {
    const disabledEl = document.getElementById('clashDisabledState');
    const activeEl = document.getElementById('clashActiveUI');
    if (!disabledEl || !activeEl) return;

    try {
        const client = window.apiClient;
        const [pData, clashData] = await Promise.all([
            client.get('/providers'),
            client.get('/clash/info')
        ]);
        
        if (clashData.config.enabled) {
            disabledEl.style.display = 'none';
            activeEl.style.display = 'block';
            await renderClashUI(clashData, pData);
        } else {
            disabledEl.style.display = 'block';
            activeEl.style.display = 'none';
        }
    } catch (e) { 
        console.error('[Clash UI] 模块数据获取失败:', e); 
    }
}

async function renderClashUI(clashData, pData) {
    // 1. 更新状态徽章 (增强：增加 PID 显示)
    const statusBadge = document.getElementById('clashStatusBadge');
    if (statusBadge) {
        if (clashData.status === 'running') {
            statusBadge.innerHTML = `
                <span class="badge badge-success" style="background:#059669;padding:2px 8px;border-radius:4px;color:white;">核心已就绪</span>
                <span style="font-family:monospace; font-size:12px; margin-left:10px; color:var(--text-secondary);">PID: ${clashData.pid}</span>
            `;
        } else if (clashData.status === 'initializing') {
            statusBadge.innerHTML = '<span class="badge badge-warning" style="background:#f59e0b;padding:2px 8px;border-radius:4px;color:white;">核心初始化中...</span>';
        } else {
            statusBadge.innerHTML = '<span class="badge" style="background:#6b7280;padding:2px 8px;border-radius:4px;color:white;">核心已停止</span>';
        }
    }

    // 2. 预定义区域分流选项
    const regionOptions = [
        { val: 'GLOBAL', label: '🌐 跟随模块全局 (7890)', icon: 'fa-network-wired' },
        { val: 'DIRECT', label: '🚀 强制直连 (直通)', icon: 'fa-bolt' },
        { val: 'US', label: '🇺🇸 美国区域 (Port: 19000)', icon: 'fa-flag-usa' },
        { val: 'HK', label: '🇭🇰 香港区域 (Port: 19001)', icon: 'fa-city' },
        { val: 'SG', label: '🇸🇬 新加坡区域 (Port: 19002)', icon: 'fa-city' },
        { val: 'JP', label: '🇯🇵 日本区域 (Port: 19003)', icon: 'fa-city' }
    ];

    // 3. 更新供应商分流表格
    const providers = Object.keys(pData.items || {});
    const tbody = document.getElementById('clashRoutingTable');
    if (tbody) {
        tbody.innerHTML = '';
        providers.forEach((pid) => {
            const tr = document.createElement('tr');
            const routing = clashData.config.routing || {};
            const currentVal = routing[pid] || 'GLOBAL';
            
            let optionsHtml = regionOptions.map(opt => 
                `<option value="${opt.val}" ${currentVal === opt.val ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            
            tr.innerHTML = `
                <td style="padding:12px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <div style="font-weight: 600; color: var(--primary);">${pid}</div>
                </td>
                <td style="padding:12px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <select class="form-control" onchange="window.updateProviderRoute('${pid}', this.value)" style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(0,0,0,0.1); background: var(--bg-secondary); cursor: pointer;">
                        ${optionsHtml}
                    </select>
                </td>`;
            tbody.appendChild(tr);
        });
    }
    
    // 4. 更新输入框值
    const subInput = document.getElementById('clashSubUrlInput');
    const portInput = document.getElementById('clashPortInput');
    if (subInput && document.activeElement !== subInput) subInput.value = clashData.config.subUrl || '';
    if (portInput && document.activeElement !== portInput) portInput.value = clashData.config.port || 7890;
}

async function updateProviderRoute(provider, node) {
    try {
        await window.apiClient.post('/clash/route', { provider, node });
        showToast(`路由更新: ${provider} -> ${node}`, 'success');
    } catch (e) {
        showToast('路由更新失败: ' + e.message, 'error');
    }
}

async function saveClashSettings() {
    const subUrl = document.getElementById('clashSubUrlInput').value;
    const port = parseInt(document.getElementById('clashPortInput').value);

    try {
        await window.apiClient.post('/clash/config', { subUrl, port });
        showToast('Clash 配置已更新，核心正在重启...', 'success');
        setTimeout(loadClashDetails, 3000);
    } catch (e) {
        showToast('配置保存失败: ' + e.message, 'error');
    }
}
