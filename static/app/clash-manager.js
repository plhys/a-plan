/**
 * Clash 代理管理逻辑 - 极客对齐版
 */
import { showToast } from './utils.js';

export async function initClashManager() {
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && navItem.dataset.section === 'clash') {
            updateClashUIState();
        }
    });
    updateClashUIState();
}

export async function updateClashUIState() {
    const disabledEl = document.getElementById('clashDisabledState');
    const activeEl = document.getElementById('clashActiveUI');
    if (!disabledEl || !activeEl) return;

    try {
        const res = await fetch('/api/plugins');
        const data = await res.json();
        const plugins = data.plugins || [];
        const plugin = plugins.find(p => p.name === 'clash-guardian');
        
        console.log('[Clash UI] 插件状态:', plugin);

        if (plugin && plugin.installed && plugin.enabled) {
            disabledEl.style.display = 'none';
            activeEl.style.display = 'block';
            await loadClashDetails();
        } else {
            disabledEl.style.display = 'block';
            activeEl.style.display = 'none';
        }
    } catch (e) {
        console.error('[Clash UI] 状态检查失败:', e);
        disabledEl.style.display = 'block';
        activeEl.style.display = 'none';
    }
}

async function loadClashDetails() {
    try {
        console.log('[Clash UI] 正在加载详情...');
        const client = window.apiClient;
        
        // 使用 apiClient 自动处理 /api 前缀和 Auth Header
        const [pData, clashData] = await Promise.all([
            client.get('/providers'),
            client.get('/plugins/clash-guardian/info')
        ]);
        
        const providers = Object.keys(pData.items || {});
        const tbody = document.getElementById('clashRoutingTable');
        if (tbody) {
            tbody.innerHTML = '';
            providers.forEach(pid => {
                const tr = document.createElement('tr');
                const routing = clashData.config.routing || {};
                const selected = routing[pid] || 'direct';
                let options = `<option value="direct">🚀 全球直连</option>`;
                (clashData.nodes || []).forEach(n => {
                    options += `<option value="${n.name}" ${selected === n.name ? 'selected' : ''}>${n.name}</option>`;
                });
                tr.innerHTML = `<td>${pid}</td><td><select class="form-control" onchange="window.updateProviderRoute('${pid}', this.value)" style="padding: 4px;">${options}</select></td>`;
                tbody.appendChild(tr);
            });
        }
        
        const subInput = document.getElementById('clashSubUrlInput');
        const portInput = document.getElementById('clashPortInput');
        if (subInput) subInput.value = clashData.config.subUrl || '';
        if (portInput) portInput.value = clashData.config.port || '7890';
    } catch (e) { 
        console.error('[Clash UI] 加载详情失败:', e); 
    }
}

window.updateProviderRoute = async function(provider, node) {
    try {
        await window.apiClient.post('/plugins/clash-guardian/route', { provider, node });
        showToast('路由已更新', `供应商 ${provider} -> ${node}`, 'success');
    } catch (e) {
        showToast('更新失败', e.message, 'error');
    }
};

window.saveClashSettings = async function() {
    const subUrl = document.getElementById('clashSubUrlInput').value;
    const port = document.getElementById('clashPortInput').value;
    try {
        await window.apiClient.post('/plugins/clash-guardian/config', { subUrl, port });
        showToast('配置已保存', 'Clash 核心正在同步...', 'success');
        loadClashDetails();
    } catch (e) {
        showToast('保存失败', e.message, 'error');
    }
};
