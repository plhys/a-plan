import { convertData } from '../convert/convert.js';
import { MODEL_PROVIDER } from '../utils/common.js';
import { CONFIG } from '../core/config-manager.js';

/**
 * 获取模型配置元数据
 * @param {string} modelId - 模型 ID 或别名
 * @param {string|null} provider - 自定义模型归属的提供商
 * @returns {Object|null} 模型配置
 */
export function getCustomModelConfig(modelId, provider = null) {
    if (!CONFIG.customModels || !Array.isArray(CONFIG.customModels)) {
        return null;
    }

    let targetProvider = provider && provider !== MODEL_PROVIDER.AUTO ? provider : null;
    let targetModelId = modelId;

    if (typeof modelId === 'string' && modelId.includes(':')) {
        const [prefix, ...modelParts] = modelId.split(':');
        targetProvider = prefix;
        targetModelId = modelParts.join(':');
    }

    if (!targetProvider) {
        return CONFIG.customModels.find(m =>
            !m.provider &&
            (m.id === targetModelId || m.alias === targetModelId)
        ) || null;
    }

    return CONFIG.customModels.find(m =>
        m.provider === targetProvider &&
        (m.id === targetModelId || m.alias === targetModelId)
    ) || null;
}

/**
 * 各提供商支持的模型列表
 * 用于前端UI选择不支持的模型
 */
export const PROVIDER_MODELS = {
    'gemini-api-key': [
        // 免费模型
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
        // 付费模型
        'gemini-2.0-pro',
        'gemini-2.5-pro',
        'gemini-1.5-pro',
        // 预览版 (最新)
        'gemini-2.5-flash-preview-05-20',
        'gemini-2.5-pro-preview-06-05',
        'gemini-3-flash-preview',
        'gemini-3-pro-preview',
        'gemini-3.1-flash-preview',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite-preview',
    ],
    'claude-custom': [],
    'openai-custom': [],
    'openaiResponses-custom': [],
    'forward-api': [],
    'grok-custom': [
        'grok-4.1-mini',
        'grok-4.1-thinking',
        'grok-4.20',
        'grok-4.20-auto',
        'grok-4.20-fast',
        'grok-4.20-expert',
        'grok-4.20-heavy',
        'grok-imagine-1.0',
        'grok-imagine-1.0-edit',
        'grok-imagine-1.0-fast',
        'grok-imagine-1.0-fast-edit',
    ],
    // Cloudflare Gateway 的模型列表由目标 API 决定，使用动态获取
    'cloudflare-gateway-free': [],
    'cloudflare-gateway-proxy': []
};

export const MANAGED_MODEL_LIST_PROVIDERS = [
    'openai-custom',
    'openaiResponses-custom',
    'claude-custom',
    'cloudflare-gateway-free',
    'cloudflare-gateway-proxy'
];

export function getManagedModelListProviderType(providerType) {
    return MANAGED_MODEL_LIST_PROVIDERS.find(baseType =>
        providerType === baseType || providerType.startsWith(baseType + '-')
    ) || null;
}

export function usesManagedModelList(providerType) {
    return getManagedModelListProviderType(providerType) !== null;
}

export function normalizeModelIds(models = []) {
    return [...new Set(
        (Array.isArray(models) ? models : [])
            .filter(model => typeof model === 'string')
            .map(model => model.trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
}

export function getCustomModelActualProvider(modelConfig) {
    if (!modelConfig) {
        return '';
    }
    if (Object.prototype.hasOwnProperty.call(modelConfig, 'actualProvider')) {
        return modelConfig.actualProvider || '';
    }
    return modelConfig.provider || '';
}

export function getCustomModelListProvider(modelConfig) {
    return modelConfig?.provider || getCustomModelActualProvider(modelConfig);
}

export function customModelMatchesProvider(modelConfig, providerType) {
    const listProvider = getCustomModelListProvider(modelConfig);
    return listProvider === providerType || (listProvider && providerType.startsWith(listProvider + '-'));
}

function extractModelIdsFromListShape(modelList) {
    if (!modelList) {
        return [];
    }

    if (Array.isArray(modelList)) {
        return modelList.map(item => {
            if (typeof item === 'string') return item;
            return item?.id || item?.name || item?.model || null;
        }).filter(Boolean);
    }

    if (Array.isArray(modelList.data)) {
        return modelList.data.map(item => item?.id || item?.name || item?.model || null).filter(Boolean);
    }

    if (Array.isArray(modelList.models)) {
        return modelList.models.map(item => {
            if (typeof item === 'string') return item;
            return item?.id || item?.name || item?.model || null;
        }).filter(Boolean);
    }

    return [];
}

export function extractModelIdsFromNativeList(modelList, providerType) {
    let convertedModelList = modelList;

    // Cloudflare Gateway 使用 Workers AI 适配器，已经返回 OpenAI 兼容格式，不需要转换
    const isCloudflareGateway = providerType === MODEL_PROVIDER.CLOUDFLARE_GATEWAY_FREE || 
                                 providerType === MODEL_PROVIDER.CLOUDFLARE_GATEWAY_PROXY;

    // 只有在提供商类型与目标类型协议不同时才尝试转换（Cloudflare Gateway 除外）
    if (!isCloudflareGateway && providerType !== MODEL_PROVIDER.OPENAI_CUSTOM && !providerType.startsWith(MODEL_PROVIDER.OPENAI_CUSTOM + '-')) {
        try {
            convertedModelList = convertData(modelList, 'modelList', providerType, MODEL_PROVIDER.OPENAI_CUSTOM);
        } catch {
            convertedModelList = modelList;
        }
    }

    const convertedIds = normalizeModelIds(extractModelIdsFromListShape(convertedModelList));
    if (convertedIds.length > 0) {
        return convertedIds;
    }

    return normalizeModelIds(extractModelIdsFromListShape(modelList));
}

export function getConfiguredSupportedModels(providerType, providerConfig = {}) {
    if (!usesManagedModelList(providerType)) {
        return [];
    }

    return normalizeModelIds(providerConfig?.supportedModels);
}

/**
 * 获取指定提供商类型支持的模型列表
 * @param {string} providerType - 提供商类型
 * @returns {Array<string>} 模型列表
 */
export function getProviderModels(providerType) {
    let models = [];
    if (PROVIDER_MODELS[providerType]) {
        models = [...PROVIDER_MODELS[providerType]];
    } else {
        // 尝试前缀匹配 (例如 openai-custom-1 -> openai-custom)
        for (const key of Object.keys(PROVIDER_MODELS)) {
            if (providerType.startsWith(key + '-')) {
                models = [...PROVIDER_MODELS[key]];
                break;
            }
        }
    }

    // 注入自定义模型
    if (CONFIG.customModels && Array.isArray(CONFIG.customModels)) {
        CONFIG.customModels.forEach(m => {
            // 匹配模型列表归属提供商或其后缀分组
            if (customModelMatchesProvider(m, providerType)) {
                // 注入 ID
                if (!models.includes(m.id)) {
                    models.push(m.id);
                }
            }
        });
    }

    return normalizeModelIds(models);
}

/**
 * 获取所有提供商的模型列表
 * @returns {Object} 所有提供商的模型映射
 */
export function getAllProviderModels() {
    // 执行深拷贝，避免修改原始 PROVIDER_MODELS 对象
    const allModels = {};
    for (const provider in PROVIDER_MODELS) {
        allModels[provider] = [...PROVIDER_MODELS[provider]];
    }
    
    // 合并自定义模型到对应的提供商
    if (CONFIG.customModels && Array.isArray(CONFIG.customModels)) {
        CONFIG.customModels.forEach(m => {
            // 如果指定了模型列表归属提供商，注入到该提供商
            // 如果没有指定（Auto），则注入到特殊的虚拟分组
            const targetProvider = getCustomModelListProvider(m) || 'custom-auto';
            
            if (!allModels[targetProvider]) {
                allModels[targetProvider] = [];
            }
            
            // 注入 ID
            if (!allModels[targetProvider].includes(m.id)) {
                allModels[targetProvider].push(m.id);
            }
        });
    }
    
    // 对每个列表进行排序
    for (const provider in allModels) {
        allModels[provider] = normalizeModelIds(allModels[provider]);
    }
    
    return allModels;
}
