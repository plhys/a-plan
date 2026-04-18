
import { readFileSync } from 'fs';
export default {
    name: 'clash-guardian',
    version: '1.5.0-geek',
    _config: { subUrl: '', port: '7890', routing: {} },
    _nodes: [{name:'自动选择', type:'url-test'}, {name:'香港-Google专用', type:'ss'}, {name:'直连', type:'direct'}],
    async init(config) {
        try {
            const pluginsJson = JSON.parse(readFileSync('./configs/plugins.json', 'utf8'));
            this._config = { ...this._config, ...(pluginsJson.plugins['clash-guardian']?.config || {}) };
        } catch(e) {}
        this._enabled = true;
    },
    async middleware(req, res, url, config) {
        if (!this._enabled) return null;
        const targetNode = this._config.routing[config.MODEL_PROVIDER];
        if (targetNode && targetNode !== 'direct') config.PROXY_URL = "http://127.0.0.1:" + this._config.port;
        else if (config.useProxy) config.PROXY_URL = "http://127.0.0.1:" + this._config.port;
        return null;
    },
    routes: [
        { method: 'GET', path: '/info', handler: async (m, p, req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ config: this._config, nodes: this._nodes }));
            return true;
        }},
        { method: 'POST', path: '/route', handler: async (m, p, req, res) => {
            const body = await new Promise(r => { let b=''; req.on('data', c=>b+=c); req.on('end', ()=>r(JSON.parse(b))); });
            this._config.routing[body.provider] = body.node;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return true;
        }},
        { method: 'POST', path: '/config', handler: async (m, p, req, res) => {
            const body = await new Promise(r => { let b=''; req.on('data', c=>b+=c); req.on('end', ()=>r(JSON.parse(b))); });
            this._config = { ...this._config, ...body };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return true;
        }}
    ]
};