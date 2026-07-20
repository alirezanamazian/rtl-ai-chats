// RTL AI Chats (injected)
(function () {
    'use strict';

    // Guard against double-loading
    if (window.__rtlAiChatsLoaded) return;
    window.__rtlAiChatsLoaded = true;

    const DEFAULT_CONFIG = {
        font: { family: 'Vazirmatn', scale: 1, lineHeight: 1.85 },
        detection: { mode: 'ratio', threshold: 0.3 },
        applyToInput: true,
        showMessageToggles: true,
        keepCodeLeftToRight: true,
    };
    const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.__RTL_AI_CHATS_CONFIG__ || {});
    CONFIG.font = Object.assign({}, DEFAULT_CONFIG.font, CONFIG.font);
    CONFIG.detection = Object.assign({}, DEFAULT_CONFIG.detection, CONFIG.detection);

    // ── [1] CSS FIX ──────────────────────────────────────────────────────────
    const fontStack =
        CONFIG.font.family === 'System default'
            ? 'inherit'
            : `'${CONFIG.font.family}', 'Sahel', 'Vazirmatn', sans-serif`;
    const codeLtrRule = CONFIG.keepCodeLeftToRight
        ? `
        pre, code, .monaco-editor, .view-lines, .view-line {
            direction: ltr !important;
            unicode-bidi: embed !important;
            text-align: left !important;
        }
        [data-rtl-ai="1"] pre,
        [data-rtl-ai="1"] code,
        [data-rtl-ai="1"] .monaco-editor,
        [data-rtl-ai="1"] .view-line {
            direction: ltr !important;
            text-align: left !important;
            unicode-bidi: embed !important;
        }`
        : '';

    const styleEl = document.createElement('style');
    styleEl.id = 'rtl-ai-chats-fix';
    styleEl.textContent = `
        * {
            direction: inherit !important;
            unicode-bidi: embed !important;
        }
        ${codeLtrRule}
        [data-rtl-ai="1"] {
            direction: rtl !important;
            text-align: right !important;
            font-family: ${fontStack};
            font-size: calc(1em * ${CONFIG.font.scale}) !important;
            line-height: ${CONFIG.font.lineHeight} !important;
        }
        .rtl-ai-toggle {
            position: absolute;
            top: 2px;
            inset-inline-end: 2px;
            width: 16px;
            height: 16px;
            line-height: 16px;
            text-align: center;
            font-size: 11px;
            border-radius: 3px;
            cursor: pointer;
            opacity: 0.35;
            user-select: none;
            z-index: 10;
        }
        .rtl-ai-toggle:hover { opacity: 1; }
    `;

    function injectStyle() {
        if (document.head) {
            document.head.appendChild(styleEl);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.head.appendChild(styleEl);
            });
        }
    }
    injectStyle();

    // ── [2] RTL DETECTION ─────────────────────────────────────────────────────
    const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
    const RTL_CHAR_G = new RegExp(RTL_CHAR.source, 'g');
    const LTR_CHAR_G = /[A-Za-z]/g;
    const FIRST_STRONG = new RegExp(`[A-Za-z]|${RTL_CHAR.source}`);

    function isRTL(text) {
        if (CONFIG.detection.mode === 'first-strong') {
            const m = text.match(FIRST_STRONG);
            return !!m && RTL_CHAR.test(m[0]);
        }
        // ratio mode: share of RTL letters among all letters
        const rtlCount = (text.match(RTL_CHAR_G) || []).length;
        if (rtlCount === 0) return false;
        const ltrCount = (text.match(LTR_CHAR_G) || []).length;
        const total = rtlCount + ltrCount;
        if (total === 0) return false;
        return rtlCount / total >= CONFIG.detection.threshold;
    }

    // ── [3] CHAT SELECTORS ────────────────────────────────────────────────────
    const CHAT_SELECTORS = [
        // Claude Code — hashed CSS module class names, so we use substring match
        '[class*="timelineMessage_"]',
        '[class*="userMessageContainer_"]',
        '[class*="messageContainer_"]',
        '[class*="assistantMessage_"]',
        '[class*="humanMessage_"]',
        '[class*="markdownContent_"]',
        // ChatGPT / Codex
        '.text-size-chat',
        '[class*="text-size-chat"]',
        '[class*="prose"]',
        '[class*="chatMessage"]',
        // Gemini Code Assist (Angular components)
        'app-message',
        'ncfc-message',
        'app-ai-chat',
        'gcf-message',
        'app-chat-message',
    ].join(', ');

    // ── [4] RTL APPLICATION ───────────────────────────────────────────────────

    function addToggle(el) {
        if (!CONFIG.showMessageToggles) return;
        if (el.querySelector(':scope > .rtl-ai-toggle')) return;
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        const btn = document.createElement('span');
        btn.className = 'rtl-ai-toggle';
        btn.textContent = '⇄';
        btn.title = 'Toggle text direction';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowRTL = el.getAttribute('data-rtl-ai') === '1';
            el.setAttribute('data-rtl-manual', '1');
            if (nowRTL) {
                el.removeAttribute('data-rtl-ai');
                el.style.direction = 'ltr';
                el.style.textAlign = 'left';
            } else {
                el.setAttribute('data-rtl-ai', '1');
                el.style.direction = 'rtl';
                el.style.textAlign = 'right';
            }
        });
        el.appendChild(btn);
    }

    function applyRTL(el) {
        if (CONFIG.keepCodeLeftToRight) {
            el.querySelectorAll('pre, code, .monaco-editor, .view-line').forEach((codeEl) => {
                codeEl.style.direction = 'ltr';
                codeEl.style.textAlign = 'left';
                codeEl.style.unicodeBidi = 'embed';
            });
        }
        addToggle(el);
        if (el.getAttribute('data-rtl-ai') === '1') return;
        el.setAttribute('data-rtl-ai', '1');
        el.style.direction = 'rtl';
        el.style.textAlign = 'right';
    }

    function removeForcedRTL(el) {
        addToggle(el);
        if (!el.getAttribute('data-rtl-ai')) return;
        el.removeAttribute('data-rtl-ai');
        el.style.direction = '';
        el.style.textAlign = '';
    }

    function processElement(el) {
        if (!el || typeof el.getAttribute !== 'function') return;
        if (el.closest && el.closest('pre, code')) return;
        if (/^(PRE|CODE|SCRIPT|STYLE)$/.test(el.tagName || '')) return;
        if (el.getAttribute('data-rtl-manual') === '1') return; // user overrode this one by hand

        const text = el.textContent || '';
        if (!text.trim()) return;

        if (isRTL(text)) {
            applyRTL(el);
        } else {
            removeForcedRTL(el);
        }
    }

    function processElements() {
        try {
            document.querySelectorAll(CHAT_SELECTORS).forEach(processElement);
        } catch (e) {}
    }

    // ── [5] INPUT AUTO-DIRECTION ──────────────────────────────────────────────

    function processInputs() {
        if (!CONFIG.applyToInput) return;
        try {
            document.querySelectorAll('textarea, [contenteditable="true"]').forEach((input) => {
                if (input.closest && input.closest('.monaco-editor')) return;
                const text = input.value !== undefined ? input.value : (input.textContent || '');
                if (!text.trim()) return;
                if (isRTL(text)) {
                    input.style.direction = 'rtl';
                    input.style.textAlign = 'right';
                } else {
                    input.style.direction = 'ltr';
                    input.style.textAlign = 'left';
                }
            });
        } catch (e) {}
    }

    // ── [6] MUTATION OBSERVER ─────────────────────────────────────────────────

    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            let hasChanges = false;
            for (const m of mutations) {
                if ((m.type === 'childList' && m.addedNodes.length > 0) ||
                    m.type === 'characterData') {
                    hasChanges = true;
                    break;
                }
            }
            if (hasChanges) {
                clearTimeout(window._rtlAiChatsTimeout);
                window._rtlAiChatsTimeout = setTimeout(processElements, 50);
            }
        });

        const target = document.body || document.documentElement;
        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    // ── [7] INIT ──────────────────────────────────────────────────────────────

    function init() {
        processElements();
        processInputs();
        startObserver();
        if (CONFIG.applyToInput) setInterval(processInputs, 300);
        setInterval(processElements, 2000);
        console.log('RTL AI Chats: initialized', CONFIG);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    window.rtlAiChatsRefresh = processElements;
})();
