/**
 * Shadow Proxy Manager
 * v4.2.7 Geek Hardened Version
 */
export class ShadowProxyManager {
    constructor() {
        this.status = {
            enabled: false,
            activePort: 9700,
            routing: {},
            nodes: [],
            subscriptions: [],
            active: false
        };
        this.providers = [];
        this.isTesting = false;
    }

    async init() {
        this.bindGlobalEvents();
        await this.refresh();
        setInterval(() => this.syncStatus(), 10000);
    }

    bindGlobalEvents() {
        document.addEventListener('change', async (e) => {
            if (e.target && e.target.id === 'shadowProxyToggle') {
                await this.toggleProxy(e.target.checked);
            }
        });
    }

    async toggleProxy(enabled) {
        try {
            const response = await window.apiClient.post('/shadow-proxy/config', { enabled });
            if (response.success) {
                if (window.showToast) window.showToast(enabled ? '影子代理正在唤醒...' : '影子代理已休眠', 'success');
                setTimeout(() => this.refresh(), 1500);
            }
        } catch (e) {
            if (window.showToast) window.showToast('控制指令执行失败', 'error');
            const toggle = document.getElementById('shadowProxyToggle');
            if (toggle) toggle.checked = !enabled;
        }
    }

    async syncStatus() {
        if (this.isTesting) return; // 测速期间不自动同步，避免干扰
        try {
            const data = await window.apiClient.get('/shadow-proxy/info');
            this.status = data;
            this.updateUIStateOnly();
        } catch (e) {}
    }

    async refresh() {
        try {
            this.status = await window.apiClient.get('/shadow-proxy/info');
            const pData = await window.apiClient.get('/providers/supported');
            this.providers = Array.isArray(pData) ? pData : [];
            this.render();
        } catch (e) {
            console.error('[Shadow-Proxy] Refresh failed:', e);
        }
    }

    updateUIStateOnly() {
        const dot = document.getElementById('proxy-status-dot');
        const text = document.getElementById('proxy-status-text');
        const toggle = document.getElementById('shadowProxyToggle');
        const pidSpan = document.getElementById('proxy-pid');
        const cpuSpan = document.getElementById('proxy-cpu-usage');
        const memSpan = document.getElementById('proxy-mem-usage');

        if (dot) dot.className = 'status-dot' + (this.status.enabled ? ' online' : '');
        if (text) text.innerText = this.status.enabled ? 'RUNNING' : 'OFFLINE';
        if (toggle) toggle.checked = !!this.status.enabled;
        
        // 资源占用透明化显示
        if (pidSpan) pidSpan.innerText = this.status.active ? 'Active' : 'N/A';
        if (cpuSpan) cpuSpan.innerText = this.status.resources?.cpu || '0.0%';
        if (memSpan) memSpan.innerText = this.status.resources?.memory || '0 MB';
    }

    render() {
        this.updateUIStateOnly();
        const portSpan = document.getElementById('proxy-active-port');
        const subCount = document.getElementById('proxy-sub-count');
        if (portSpan) portSpan.innerText = this.status.activePort || '----';
        if (subCount) subCount.innerText = this.status.subscriptions?.length || 0;

        this.renderSubscriptions();
        this.renderMatrix();
        this.renderNodes();
    }

    renderSubscriptions() {
        const container = document.getElementById('proxy-subscriptions-list');
        if (!container) return;
        container.innerHTML = '';

        const subs = this.status.subscriptions || [];
        if (subs.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.5;">暂无订阅，点击上方“添加”按钮开始。</div>';
            return;
        }

        subs.forEach((sub, index) => {
            const item = document.createElement('div');
            item.className = 'sub-list-item';
            item.innerHTML = `
                <div class="sub-info">
                    <div class="sub-name">
                        <i class="fas fa-link"></i> ${sub.name} 
                        <span class="badge ${sub.status === 'online' ? 'badge-success' : 'badge-danger'}" style="font-size:0.6rem; margin-left:8px;">${sub.status || 'pending'}</span>
                    </div>
                    <div class="sub-url" title="${sub.url}">${sub.url}</div>
                    <div class="sub-meta" style="font-size:0.7rem; margin-top:5px; opacity:0.7;">
                        <span><i class="fas fa-cubes"></i> 节点数: ${sub.nodeCount || 0}</span>
                        <span style="margin-left:15px;"><i class="fas fa-history"></i> 更新: ${sub.lastUpdate ? new Date(sub.lastUpdate).toLocaleString() : '从不'}</span>
                    </div>
                </div>
                <div class="sub-actions">
                    <button class="btn btn-sm btn-ghost" onclick="window.shadowProxyManager.refreshNodes()" title="立即抓取最新节点">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="btn btn-sm btn-danger-alt" onclick="window.shadowProxyManager.deleteSub(${index})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    renderMatrix() {
        const container = document.getElementById('proxy-routing-matrix');
        if (!container) return;
        container.innerHTML = '';

        if (this.providers.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-tertiary);">等待提供商数据...</div>';
            return;
        }

        this.providers.forEach(p => {
            const item = document.createElement('div');
            item.className = 'matrix-item';
            const currentNode = this.status.routing?.[p] || 'DIRECT';
            
            item.innerHTML = `
                <div class="provider-name"><i class="fas fa-plug"></i> ${p}</div>
                <select class="matrix-select">
                    <option value="DIRECT" ${currentNode === 'DIRECT' ? 'selected' : ''}>--- DIRECT (直连) ---</option>
                    <option value="AUTO" ${currentNode === 'AUTO' ? 'selected' : ''}>⚡ AUTO (智能最优)</option>
                    ${this.status.nodes?.map(n => `<option value="${n.id}" ${currentNode === n.id ? 'selected' : ''}>${n.name}</option>`).join('') || ''}
                </select>
            `;

            const select = item.querySelector('select');
            select.onchange = () => this.updateRoute(p, select.value);
            container.appendChild(item);
        });
    }

    renderNodes() {
        const container = document.getElementById('proxy-node-list');
        if (!container) return;
        container.innerHTML = '';

        if (!this.status.nodes || this.status.nodes.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color:var(--text-tertiary);">
                    <i class="fas fa-search-location" style="font-size: 3rem; display: block; margin-bottom: 15px; opacity:0.5;"></i>
                    <p>未解析到有效节点。请确保：</p>
                    <div style="font-size:0.8rem; display:inline-block; text-align:left; margin-top:10px;">
                        1. 订阅链接有效且可访问<br>
                        2. 链接格式为 V2Ray/SS 标准订阅<br>
                        3. 点击订阅列表右侧的 <i class="fas fa-sync-alt"></i> 手动重新抓取
                    </div>
                </div>`;
            return;
        }

        this.status.nodes.forEach(n => {
            const card = document.createElement('div');
            card.className = 'modern-node-card' + (this.isTesting ? ' node-testing-pulse' : '');
            
            const getLatColor = (l) => {
                if (l === -1) return 'red';
                if (!l || l === 0) return 'gray';
                if (l < 300) return 'green';
                if (l < 800) return 'yellow';
                return 'red';
            };

            const formatLat = (l) => (l > 0 ? l + ' ms' : (l === -1 ? 'FAIL' : 'WAIT'));

            card.innerHTML = `
                <div class="node-card-header" style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
                    <h4 style="margin:0; font-size:0.9rem; flex:1; overflow:hidden; text-overflow:ellipsis;">${n.name}</h4>
                    <span style="font-size:0.65rem; padding:2px 6px; background:rgba(0,0,0,0.2); border-radius:4px; opacity:0.6; margin-left:10px;">${n.subName}</span>
                </div>
                <div class="latency-stack">
                    <div class="lat-bar"><span>OpenAI</span><span class="lat-val ${getLatColor(n.latency?.openai)}">${formatLat(n.latency?.openai)}</span></div>
                    <div class="lat-bar"><span>Claude</span><span class="lat-val ${getLatColor(n.latency?.claude)}">${formatLat(n.latency?.claude)}</span></div>
                    <div class="lat-bar"><span>Gemini</span><span class="lat-val ${getLatColor(n.latency?.gemini)}">${formatLat(n.latency?.gemini)}</span></div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async refreshNodes() {
        if (window.showToast) window.showToast('正在从远端订阅源抓取节点...', 'info');
        try {
            await window.apiClient.post('/shadow-proxy/refresh-nodes', {});
            await this.refresh();
        } catch (e) {}
    }

    async updateRoute(provider, nodeId) {
        try {
            await window.apiClient.post('/shadow-proxy/route', { provider, nodeId });
            if (window.showToast) window.showToast(`路由切换成功`, 'success');
            this.status.routing[provider] = nodeId;
        } catch (e) {}
    }

    async testAllAI() {
        if (this.isTesting) return;
        this.isTesting = true;
        if (window.showToast) window.showToast('AI 专项雷达启动中，请观察节点反馈...', 'info');
        
        try {
            await window.apiClient.post('/shadow-proxy/test-ai', {});
            // 快速刷新几次，直到看到数据变化
            let count = 0;
            const timer = setInterval(async () => {
                await this.refresh();
                if (++count > 5) {
                    this.isTesting = false;
                    clearInterval(timer);
                }
            }, 2000);
        } catch (e) {
            this.isTesting = false;
        }
    }

    async deleteSub(index) {
        if (!confirm('删除此订阅将同步清理相关节点，确定吗？')) return;
        try {
            const res = await window.apiClient.delete(`/shadow-proxy/subscription/${index}`);
            if (res.success) {
                if (window.showToast) window.showToast('订阅已移除', 'success');
                await this.refresh();
            }
        } catch (e) {}
    }

    openAddSub() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay shadow-modal';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="modal-content geek-modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> 添加影子订阅</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label>订阅名称 (例如: 备用线路)</label>
                        <input type="text" id="sub-name-input" class="form-control" placeholder="输入识别名称">
                    </div>
                    <div class="form-group">
                        <label>订阅链接 (HTTP/HTTPS)</label>
                        <input type="text" id="sub-url-input" class="form-control" placeholder="粘贴你的订阅地址">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel">取消</button>
                    <button class="btn btn-primary modal-confirm" id="btn-confirm-add-sub">开始抓取</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-close').onclick = closeModal;
        modal.querySelector('.modal-cancel').onclick = closeModal;

        modal.querySelector('#btn-confirm-add-sub').onclick = async () => {
            const name = document.getElementById('sub-name-input').value.trim();
            const url = document.getElementById('sub-url-input').value.trim();
            if (!url) return;

            try {
                const res = await window.apiClient.post('/shadow-proxy/subscription', { url, name: name || 'New Sub' });
                if (res.success) {
                    if (window.showToast) window.showToast('已加入抓取队列', 'success');
                    closeModal();
                    await this.refreshNodes(); // 添加后自动触发一次抓取
                }
            } catch (e) {}
        };
    }
}

export function initShadowProxyManager() {
    if (!window.shadowProxyManager) {
        window.shadowProxyManager = new ShadowProxyManager();
    }
    return window.shadowProxyManager;
}
