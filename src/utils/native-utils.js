/**
 * Native Deep Merge implementation to replace 'deepmerge' and 'lodash'
 * Optimized for A-Plan performance.
 */
export function deepMerge(target, source) {
    if (!source) return target;
    if (typeof source !== 'object' || Array.isArray(source)) return source;
    
    const merged = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            merged[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            merged[key] = source[key];
        }
    }
    return merged;
}

/**
 * Native Simple Clone to replace lodash.cloneDeep for config
 */
export function cloneConfig(obj) {
    return JSON.parse(JSON.stringify(obj));
}
