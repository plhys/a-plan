// 导航功能模块

import { elements } from './constants.js';

/**
 * 初始化导航功能
 */
function initNavigation() {
    if (!elements.navItems || !elements.sections) {
        console.warn('导航元素未找到');
        return;
    }

    // 【极客修复】处理初始页面加载时的锚点路由
    const handleInitialRoute = () => {
        const hash = window.location.hash.substring(1);
        console.log('[Navigation] 初始路由检测, Hash:', hash);
        
        // 强制清理所有硬编码的 active 类，防止首页遮挡
        if (elements.navItems) elements.navItems.forEach(i => i.classList.remove('active'));
        if (elements.sections) elements.sections.forEach(s => s.classList.remove('active'));

        if (hash) {
            console.log('[Navigation] 正在通过锚点恢复页面:', hash);
            switchToSection(hash);
        } else {
            // 如果没有 hash，默认跳转到 dashboard
            switchToSection('dashboard');
        }
    };

    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // 如果是 a 标签且 href 以 # 开头，我们允许 hash 变化
            const sectionId = item.dataset.section;
            if (sectionId) {
                // e.preventDefault(); // 不再阻止默认行为，让 hash 自动更新
                switchToSection(sectionId);
            }
        });
    });

    // 监听 hash 变化 (支持浏览器后退/前进)
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.substring(1);
        if (hash) switchToSection(hash);
    });

    // 因为 initNavigation 是在 initializeComponents 之后执行的，
    // 我们直接执行路由检测。
    handleInitialRoute();
}

/**
 * 切换到指定章节
 * @param {string} sectionId - 章节ID
 */
function switchToSection(sectionId) {
    console.log('[Navigation] 切换到章节:', sectionId);
    
    // 更新导航状态
    const navItems = elements.navItems;
    navItems.forEach(nav => {
        nav.classList.remove('active');
        if (nav.dataset.section === sectionId) {
            nav.classList.add('active');
        }
    });

    // 显示对应章节
    const sections = elements.sections;
    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === sectionId) {
            section.classList.add('active');
            
            // 如果是日志页面，默认滚动到底部
            if (sectionId === 'logs') {
                setTimeout(() => {
                    const logsContainer = document.getElementById('logsContainer');
                    if (logsContainer) {
                        logsContainer.scrollTop = logsContainer.scrollHeight;
                    }
                }, 100);
            }
        }
    });

    // 滚动到顶部
    scrollToTop();
}

/**
 * 滚动到页面顶部
 */
function scrollToTop() {
    const contentContainer = document.getElementById('content-container');
    if (contentContainer) {
        contentContainer.scrollTop = 0;
    }
    window.scrollTo(0, 0);
}

/**
 * 切换到仪表盘页面
 */
function switchToDashboard() {
    window.location.hash = 'dashboard';
}

/**
 * 切换到提供商页面
 */
function switchToProviders() {
    window.location.hash = 'providers';
}

export {
    initNavigation,
    switchToSection,
    switchToDashboard,
    switchToProviders
};
