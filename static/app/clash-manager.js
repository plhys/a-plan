
/**
 * Clash 代理管理逻辑 - 2.9 极客模块版 (透明化增强)
 */
import { showToast } from './utils.js';

export async function initClashManager() {
    window.updateClashUIState = loadClashDetails;
    window.saveClashSettings = saveClashSettings;
    
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
    // 1. 更新状态徽章
    const statusBadge = document.getElementById('clashStatusBadge');
    if (statusBadge) {
        statusBadge.innerHTML = clashData.status === 'running' 
            ? '<span class="badge badge-success" style="background:#059669;padding:2px 8px;border-radius:4px;color:white;">核心已就绪</span>' 
            : '<span class="badge badge-warning" style="background:#f59e0b;padding:2px 8px;border-radius:4px;color:white;">核心初始化中...</span>';
    }

    // 2. 更新节点概览 (透明化增强)
    const nodes = clashData.nodes || [];
    const countEl = document.getElementById('clashNodeCount');
    const overviewEl = document.getElementById('clashNodesOverview');
    if (countEl) countEl.innerText = nodes.length;
    if (overviewEl) {
        if (nodes.length > 0) {
            overviewEl.innerHTML = nodes.map(n => 
                `<span style="background:var(--bg-secondary); padding:4px 10px; border-radius:15px; font-size:12px; border:1px solid rgba(0,0,0,0.1);">
                    <i class="fas fa-link" style="color:var(--primary); font-size:10px;"></i> ${n.name}
                </span>`
            ).join('');
        } else {
            overviewEl.innerHTML = '<p style="color:var(--text-secondary); width:100%; text-align:center; padding:20px;">并未从订阅中解析到有效节点，请检查订阅内容或 YAML 格式。</p>';
        }
    }

    // 3. 更新供应商分流表格
    const providers = Object.keys(pData.items || {});
    const tbody = document.getElementById('clashRoutingTable');
    if (tbody) {
        tbody.innerHTML = '';
        providers.forEach((pid, index) => {
            const tr = document.createElement('tr');
            const routing = clashData.config.routing || {};
            const selected = routing[pid] || 'direct';
            
            let options = `<option value="direct">🚀 全球直连</option>`;
            nodes.forEach(n => {
                options += `<option value="${n.name}" ${selected === n.name ? 'selected' : ''}>${n.name}</option>`;
            });
            
            tr.innerHTML = `
                <td style="padding:12px;">
                    <div style="font-weight: 600;">${pid}</div>
                    <div style="font-size: 11px; color: #6b7280;">分流端口: ${19800 + index}</div>
                </td>
                <td style="padding:12px;">
                    <select class="form-control" onchange="window.updateProviderRoute('${pid}', this.value)" style="width:100%;padding:6px;border-radius:4px;border:1px solid #ddd;">
                        ${options}
                    </select>
                </td>`;
            tbody.appendChild(tr);
        });
    }
    
    // 4. 更新输入框值 (仅当未聚焦时更新，防止输入被覆盖)
    const subInput = document.getElementById('clashSubUrlInput');
    const portInput = document.getElementById('clashPortInput');
    if (subInput && document.activeElement !== subInput) subInput.value = clashData.config.subUrl || '';
    if (portInput && document.activeElement !== portInput) portInput.value = clashData.config.port || '7890';
}

window.updateProviderRoute = async function(provider, node) {
    try {
        await window.apiClient.post('/clash/route', { provider, node });
        showToast('路由生效', `${provider} -> ${node}`, 'success');
        loadClashDetails(); // 立即同步 UI
    } catch (e) {
        showToast('操作失败', e.message, 'error');
    }
};

window.saveClashSettings = async function() {
    const subUrl = document.getElementById('clashSubUrlInput').value;
    const port = parseInt(document.getElementById('clashPortInput').value);
    
    try {
        showToast('正在解析', '正在同步云端订阅并重构本地内核...', 'info');
        await window.apiClient.post('/clash/config', { subUrl, port });
        showToast('同步成功', '节点已刷新，内核已复活', 'success');
        setTimeout(loadClashDetails, 2000);
    } catch (e) {
        showToast('失败', e.message, 'error');
    }
};
