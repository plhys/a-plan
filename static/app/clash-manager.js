
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
    // ... (前略：徽章和路由表部分保持不变)

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

    // 4. 更新节点概览 (极客视觉增强版)
    const nodes = clashData.nodes || [];
    const countEl = document.getElementById('clashNodeCount');
    const overviewEl = document.getElementById('clashNodesOverview');
    if (countEl) countEl.innerText = nodes.length;
    
    if (overviewEl) {
        if (nodes.length > 0) {
            overviewEl.innerHTML = nodes.map(n => {
                const delay = n.delay || 0;
                let color = '#9ca3af'; // 灰色 (未测速)
                if (delay > 0) {
                    if (delay < 300) color = '#059669'; // 绿色
                    else if (delay < 600) color = '#d97706'; // 橙色
                    else color = '#dc2626'; // 红色
                }
                return `
                <div class="node-tag" onclick="window.testNodeDelay('${n.name}')" title="点击测速" style="background:var(--bg-secondary); padding:6px 12px; border-radius:8px; font-size:12px; border:1px solid rgba(0,0,0,0.1); cursor:pointer; display:flex; align-items:center; gap:8px; transition: all 0.2s;">
                    <i class="fas fa-signal" style="color:${color};"></i>
                    <span style="font-weight:500;">${n.name}</span>
                    ${delay > 0 ? `<span style="font-size:10px; color:${color};">${delay}ms</span>` : ''}
                </div>`;
            }).join('');
            
            // 增加一键测速按钮
            if (!document.getElementById('clashTestAllBtn')) {
                const btn = document.createElement('button');
                btn.id = 'clashTestAllBtn';
                btn.className = 'btn btn-sm btn-outline-primary';
                btn.style = 'margin-left: 15px; font-size: 11px; padding: 2px 8px;';
                btn.innerHTML = '<i class="fas fa-bolt"></i> 一键测速';
                btn.onclick = window.testAllNodes;
                countEl.parentNode.appendChild(btn);
            }
        } else {
            overviewEl.innerHTML = '<p style="color:var(--text-secondary); padding:20px;">暂无节点，请先更新订阅。</p>';
        }
    }
}

window.testNodeDelay = async (name) => {
    try {
        const res = await window.apiClient.post('/clash/test', { name });
        showToast(`${name} 延迟: ${res.delay}ms`, 'success');
        await loadClashDetails();
    } catch (e) {}
};

window.testAllNodes = async () => {
    const btn = document.getElementById('clashTestAllBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 测速中...';
    try {
        const data = await window.apiClient.get('/clash/info');
        const nodes = data.nodes || [];
        showToast(`正在对 ${nodes.length} 个节点发起并发测速...`, 'info');
        
        // 分批测速，防止核心炸掉
        for (let i = 0; i < nodes.length; i += 5) {
            const batch = nodes.slice(i, i + 5);
            await Promise.all(batch.map(n => window.apiClient.post('/clash/test', { name: n.name })));
        }
        showToast('全量测速完成', 'success');
    } catch (e) {
        showToast('测速失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bolt"></i> 一键测速';
        await loadClashDetails();
    }
};

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
    const saveBtn = document.querySelector('button[onclick="window.saveClashSettings()"]');
    const originalHtml = saveBtn.innerHTML;

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在同步节点...';
        
        await window.apiClient.post('/clash/config', { subUrl, port });
        showToast('配置已下发，正在实时抓取节点...', 'success');
        
        // 自动轮询：直到刷出节点为止
        let checkCount = 0;
        const autoRefresh = setInterval(async () => {
            checkCount++;
            const data = await window.apiClient.get('/clash/info');
            if (data.nodes && data.nodes.length > 0 || checkCount > 5) {
                clearInterval(autoRefresh);
                await loadClashDetails();
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalHtml;
                if (data.nodes.length > 0) {
                    showToast(`成功抓取 ${data.nodes.length} 个节点`, 'success');
                }
            }
        }, 1500);
        
    } catch (e) {
        showToast('配置保存失败: ' + e.message, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
    }
}
