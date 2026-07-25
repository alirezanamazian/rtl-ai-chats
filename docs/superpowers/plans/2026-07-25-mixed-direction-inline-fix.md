# Mixed-direction Inline Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `rtl-script.js`'s blanket `unicode-bidi: embed !important` override with a scoped `unicode-bidi: plaintext` + RLM-anchor + `isolate` strategy, so numbers, inline code, and URLs embedded inside RTL chat messages (Claude Code, Codex, Gemini Code Assist) render in correct reading order instead of fighting the browser's own Unicode Bidi Algorithm.

**Architecture:** All three panels share one injected script, `rtl-script.js`, which is patched into each editor's extension bundle by `fix-rtl.js` / `extension.js`. The fix is entirely inside `rtl-script.js`: (1) the static `<style>` block gets its bidi strategy changed, (2) `applyRTL()` gains an RLM-anchoring step. No other file changes. No build step — `fix-rtl.js` copies `rtl-script.js`'s raw text into the target webview file, so editing the source file is the whole change; re-running `fix-rtl.js` (or the extension's own auto-fix/reinject) re-patches every installed editor from the updated source.

**Tech Stack:** Plain JS injected into Electron/Chromium webviews (no framework, no build tool, no test runner — this repo has none).

## Global Constraints

- No automated test suite exists in this repo — every verification step in this plan is manual, run against a real installed editor.
- Detection logic (`isRTL()`, `CONFIG.detection.mode`/`threshold`) must not change — only how direction gets *applied* to the DOM changes.
- The manual per-message toggle (`.rtl-ai-toggle`, `data-rtl-manual="1"`) must keep working unchanged.
- Scope is limited to `rtl-script.js` (Claude Code / Codex / Gemini webview panels). `rtl-workbench.css` / native workbench panels are explicitly out of scope for this plan (see spec's Follow-up section).
- On this machine, only Devin Desktop has Claude Code (`anthropic.claude-code-2.1.218-darwin-arm64`) and Codex (`openai.chatgpt-26.721.30844-darwin-arm64`) installed under `~/.devin/extensions`. No Gemini Code Assist extension is installed anywhere, and no other editor (VS Code, Cursor, Windsurf, Antigravity) has any of the three installed — manual verification in this plan targets Devin Desktop's Claude Code and Codex panels; Gemini and other editors share the identical script so the fix applies to them too, but cannot be visually verified on this machine.

---

### Task 1: Replace the blanket bidi override with scoped `plaintext` + `isolate`

**Files:**
- Modify: `rtl-script.js:20-73` (the CSS-FIX section: `codeLtrRule` and `styleEl.textContent`)

**Interfaces:**
- Consumes: `CONFIG.keepCodeLeftToRight` (existing), `CONFIG.font` (existing), `CHAT_SELECTORS` (existing constant, currently defined at `rtl-script.js:107-133`, produced *after* this block — see Step 3 for the reordering this requires).
- Produces: no new exports; `styleEl` (module-scope `const`) keeps its existing name and role — later code (`injectStyle()`) is unaffected.

- [ ] **Step 1: Read the current CSS-FIX block and CHAT_SELECTORS block to confirm line numbers before editing**

Run: `grep -n "CHAT_SELECTORS\|CSS FIX\|styleEl.textContent" rtl-script.js`
Expected output includes `20:    // ── [1] CSS FIX`, a line defining `const CHAT_SELECTORS = [`, and `44:    styleEl.textContent = \``.
(Line numbers may have shifted slightly from a prior edit — use the grep output, not the numbers above, for the exact edit target.)

- [ ] **Step 2: Move the `CHAT_SELECTORS` constant above the CSS-FIX section**

The new CSS needs to reference `CHAT_SELECTORS` in a template string, but today it's declared later in the file (section `[3] CHAT SELECTORS`). Cut the whole `const CHAT_SELECTORS = [...].join(', ');` block out of section `[3]` and paste it immediately above the `// ── [1] CSS FIX ──` comment, so the file reads:

```javascript
    const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.__RTL_AI_CHATS_CONFIG__ || {});
    CONFIG.font = Object.assign({}, DEFAULT_CONFIG.font, CONFIG.font);
    CONFIG.detection = Object.assign({}, DEFAULT_CONFIG.detection, CONFIG.detection);

    // ── [1] CHAT SELECTORS ────────────────────────────────────────────────────
    const CHAT_SELECTORS = [
        // Claude Code — hashed CSS module class names, so we use substring match
        '[class*="timelineMessage_"]',
        '[class*="userMessageContainer_"]',
        '[class*="messageContainer_"]',
        '[class*="assistantMessage_"]',
        '[class*="humanMessage_"]',
        '[class*="markdownContent_"]',
        // Claude Code — AskUserQuestion / permission request widget
        '[class*="questionTextLarge_"]',
        '[class*="optionLabel_"]',
        '[class*="optionDescription_"]',
        '[class*="navTabLabel_"]',
        // ChatGPT / Codex
        '.text-size-chat',
        '[class*="text-size-chat"]',
        '[class*="prose"]',
        '[class*="chatMessage"]',
        // Codex — clarifying-question options (no dedicated class, radiogroup is the anchor)
        '[role="radiogroup"] span',
        // Gemini Code Assist (Angular components)
        'app-message',
        'ncfc-message',
        'app-ai-chat',
        'gcf-message',
        'app-chat-message',
    ].join(', ');

    // ── [2] CSS FIX ──────────────────────────────────────────────────────────
```

Renumber the section comments that follow (`[2] CSS FIX` → what was `[1]`, the old `[2] RTL DETECTION` becomes `[3]`, the old `[3] CHAT SELECTORS` section header is now empty and should be deleted since its content moved up, `[4] RTL APPLICATION` stays `[4]`, etc. — keep the numbers sequential and don't leave a dangling empty `[3]` header).

- [ ] **Step 3: Replace the CSS-FIX block's content**

Replace the entire block from the old `// ── [1] CSS FIX ──` comment (now renumbered) through the end of `styleEl.textContent` (originally lines 20-73) with:

```javascript
    // ── [2] CSS FIX ──────────────────────────────────────────────────────────
    const fontStack =
        CONFIG.font.family === 'System default'
            ? 'inherit'
            : `'${CONFIG.font.family}', 'Sahel', 'Vazirmatn', sans-serif`;
    const codeLtrRule = CONFIG.keepCodeLeftToRight
        ? `
        pre, code, .monaco-editor, .view-lines, .view-line {
            direction: ltr !important;
            unicode-bidi: isolate !important;
            text-align: left !important;
        }
        [data-rtl-ai="1"] pre,
        [data-rtl-ai="1"] code,
        [data-rtl-ai="1"] .monaco-editor,
        [data-rtl-ai="1"] .view-line {
            direction: ltr !important;
            text-align: left !important;
            unicode-bidi: isolate !important;
        }`
        : '';

    const styleEl = document.createElement('style');
    styleEl.id = 'rtl-ai-chats-fix';
    styleEl.textContent = `
        ${CHAT_SELECTORS}, ${CHAT_SELECTORS.split(', ').map((s) => `${s} p, ${s} li, ${s} h1, ${s} h2, ${s} h3, ${s} h4, ${s} h5, ${s} h6`).join(', ')} {
            unicode-bidi: plaintext !important;
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
```

This removes the `* { direction: inherit !important; unicode-bidi: embed !important; }` rule entirely — direction on non-matched elements is no longer touched at all, which is correct: this extension should only ever affect matched chat content, never arbitrary editor chrome.

- [ ] **Step 4: Sanity-check the generated CSS by hand**

Run: `node -e "
const CHAT_SELECTORS = ['.foo','.bar'].join(', ');
console.log(\`\${CHAT_SELECTORS}, \${CHAT_SELECTORS.split(', ').map((s) => \\\`\${s} p, \${s} li\\\`).join(', ')} { unicode-bidi: plaintext !important; }\`);
"`
Expected output: `.foo, .bar, .foo p, .foo li, .bar p, .bar li { unicode-bidi: plaintext !important; }` — confirms the selector-expansion template string is syntactically correct before relying on it inside the real file.

- [ ] **Step 5: Commit**

```bash
git add rtl-script.js
git commit -m "$(cat <<'EOF'
Replace blanket unicode-bidi:embed with scoped plaintext + isolate

The old `* { unicode-bidi: embed !important }` rule forced every
descendant of a chat message into its own bidi embedding level in
document order, which fights the browser's real Unicode Bidi
Algorithm for streamed per-token spans containing numbers, inline
code, or URLs mid-sentence. Scope the override to matched message
containers and their paragraph-level descendants, use `plaintext` so
the browser resolves each paragraph via its own first-strong
character, and switch code isolation from `embed` to `isolate` (the
correct construct for "this run must not affect surrounding bidi
reordering").
EOF
)"
```

---

### Task 2: RLM anchoring for RTL-classified blocks starting with a Latin character

**Files:**
- Modify: `rtl-script.js` — the `applyRTL(el)` function (originally at lines 166-179, inside section `[4] RTL APPLICATION`; confirm the current line number with `grep -n "function applyRTL"` since Task 1 shifted line numbers).

**Interfaces:**
- Consumes: `CONFIG.detection` (existing), `RTL_CHAR` (existing regex, defined at what was line 87), `applyRTL(el)` (existing function signature, called from `processElement()`).
- Produces: no new exported names. `applyRTL(el)` keeps its exact name and single-argument signature — `processElement()` (Task 2 does not touch it) continues calling it exactly as before.

- [ ] **Step 1: Locate the current `applyRTL` function**

Run: `grep -n "function applyRTL" rtl-script.js`
Expected: one match, e.g. `166:    function applyRTL(el) {`. Use this line number for the edit below.

- [ ] **Step 2: Add a first-strong-character helper directly above `applyRTL`**

Insert this function immediately before `function applyRTL(el) {`:

```javascript
    // An RTL-classified block whose *first strong character* is Latin will,
    // under `unicode-bidi: plaintext`, get its paragraph direction resolved
    // by the browser as LTR regardless of our classification (P2/P3 of the
    // Unicode Bidi Algorithm looks at the first strong character only). An
    // invisible RLM (U+200F) at the very start of the text gives the
    // algorithm an RTL first-strong character to anchor on, without
    // affecting anything visible.
    const RLM = '‏';

    function firstStrongCharIsLatin(text) {
        const m = text.match(FIRST_STRONG);
        return !!m && /[A-Za-z]/.test(m[0]);
    }

    function anchorRLM(el) {
        if (el.getAttribute('data-rtl-anchored') === '1') return;
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                node.textContent = RLM + node.textContent;
                el.setAttribute('data-rtl-anchored', '1');
                return;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                anchorRLM(node);
                if (el.getAttribute('data-rtl-anchored') !== '1' && node.getAttribute('data-rtl-anchored') === '1') {
                    el.setAttribute('data-rtl-anchored', '1');
                }
                return;
            }
        }
    }
```

`FIRST_STRONG` is the existing regex from section `[3] RTL DETECTION` (`new RegExp(\`[A-Za-z]|${RTL_CHAR.source}\`)`) — this reuses it rather than redefining it.

- [ ] **Step 3: Call the anchor from `applyRTL`, guarded by the manual-override attribute**

Change:

```javascript
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
```

to:

```javascript
    function applyRTL(el) {
        if (CONFIG.keepCodeLeftToRight) {
            el.querySelectorAll('pre, code, .monaco-editor, .view-line').forEach((codeEl) => {
                codeEl.style.direction = 'ltr';
                codeEl.style.textAlign = 'left';
                codeEl.style.unicodeBidi = 'isolate';
            });
        }
        addToggle(el);
        if (el.getAttribute('data-rtl-manual') !== '1' && firstStrongCharIsLatin(el.textContent || '')) {
            anchorRLM(el);
        }
        if (el.getAttribute('data-rtl-ai') === '1') return;
        el.setAttribute('data-rtl-ai', '1');
        el.style.direction = 'rtl';
        el.style.textAlign = 'right';
    }
```

(Note the `embed` → `isolate` change on the inline `codeEl.style.unicodeBidi` assignment too — this is the same JS-applied styling path as the CSS rule from Task 1, and must match it.)

- [ ] **Step 4: Clear the anchor attribute in `removeForcedRTL` so a block that later becomes LTR-classified doesn't retain a stale RLM**

Change:

```javascript
    function removeForcedRTL(el) {
        addToggle(el);
        if (!el.getAttribute('data-rtl-ai')) return;
        el.removeAttribute('data-rtl-ai');
        el.style.direction = '';
        el.style.textAlign = '';
    }
```

to:

```javascript
    function removeForcedRTL(el) {
        addToggle(el);
        el.removeAttribute('data-rtl-anchored');
        if (!el.getAttribute('data-rtl-ai')) return;
        el.removeAttribute('data-rtl-ai');
        el.style.direction = '';
        el.style.textAlign = '';
    }
```

Streamed chat messages get their text nodes replaced/re-rendered as more tokens arrive (this is why `processElements` re-runs on every mutation), so a stale RLM character injected during an earlier, incomplete render is naturally overwritten once the real DOM text node is replaced — clearing `data-rtl-anchored` on the LTR path just prevents the attribute itself from lying about an element that's no longer RTL.

- [ ] **Step 5: Verify the file parses**

Run: `node --check rtl-script.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add rtl-script.js
git commit -m "$(cat <<'EOF'
Add RLM anchoring for RTL blocks that open with a Latin word

unicode-bidi: plaintext resolves each paragraph's direction from its
own first-strong character. A block we classify as RTL (e.g. via the
ratio heuristic) but which opens with a Latin word or filename would
otherwise be resolved LTR by the browser's own algorithm, disagreeing
with our classification. Inject an invisible RLM (U+200F) at the
start of such blocks to anchor the algorithm's paragraph-direction
detection to RTL.
EOF
)"
```

---

### Task 3: Manual verification against a real installed editor

**Files:**
- None (verification only — no source changes in this task).

**Interfaces:**
- Consumes: `rtl-script.js` as patched by Tasks 1 and 2, `fix-rtl.js` (unmodified, existing patch runner).

- [ ] **Step 1: Re-run the patch script to push the updated `rtl-script.js` into the installed extensions**

Run: `node fix-rtl.js`
Expected output includes lines like:
```
[INJ]  Claude Code (Devin Desktop): RTL script refreshed
[INJ]  ChatGPT/Codex (Devin Desktop): RTL script refreshed
```
(Only Devin Desktop's Claude Code and Codex targets exist on this machine — see Global Constraints. `Gemini Code Assist` and every other editor will print `[SKIP] ... file not found`, which is expected, not a failure.)

- [ ] **Step 2: Reload Devin Desktop**

Fully quit and reopen Devin Desktop (not just "Reload Window" — do a full app restart the first time after `node fix-rtl.js`, to be certain no stale webview process is holding the old script in memory).

- [ ] **Step 3: Paste the four spec test sentences into a Claude Code chat in Devin and visually check each one**

Open a Claude Code chat panel in Devin and send these four messages one at a time (from the spec's Testing section, `docs/superpowers/specs/2026-07-25-mixed-direction-inline-fix-design.md`):

1. `درصد رشد ماهانه ۳۰٪ بوده و پیش‌بینی می‌کنیم تا پایان سال به ۵۰٪ برسه.`
2. `برو تو فایل index.js تابع calculateTotal() رو پیدا کن و خط ۴۲ رو عوض کن.`
3. `این مستندات رو از https://example.com/docs/api بخون و خلاصه کن.`
4. `README.md رو باز کن و بخش نصب رو بخون.`

Pass criteria for each: the Persian portion reads right-to-left and right-aligned, the embedded LTR run (percentage/digits, filename+function call, URL, or the leading `README.md`) stays left-to-right internally and doesn't get mirrored or split across the wrong side of the bubble, and message 4 in particular right-aligns the whole bubble (this is the case the RLM anchor from Task 2 exists for — if message 4 renders left-aligned, the anchor isn't firing and Task 2 needs debugging before proceeding).

- [ ] **Step 4: Repeat Step 3 in the Codex (ChatGPT) panel in Devin**

Same four messages, same pass criteria, in Codex's composer/chat instead of Claude Code's. This confirms the shared `rtl-script.js` behaves consistently across both webviews' differing production DOM structure (Codex's per the `CHAT_SELECTORS` entries `.text-size-chat`, `[class*="prose"]`, etc.).

- [ ] **Step 5: Verify the manual toggle still works**

In either panel, click the `⇄` toggle chip on one of the four test messages. Expected: direction flips (RTL↔LTR) immediately, and after the flip, waiting ~2 seconds (the `setInterval(processElements, 2000)` reprocessing loop) does **not** revert it back — confirming `data-rtl-manual="1")` is still respected by `processElement()` and Task 2's RLM-anchoring guard.

- [ ] **Step 6: Verify existing detection config still applies**

Open Devin's settings and change `rtl-ai-chats.detection.mode` from `ratio` to `first-strong`, reload, and re-send message 2 from Step 3 (`برو تو فایل index.js ...`). Expected: still classified RTL (Persian is the first strong character), same visual result as under `ratio` mode — confirming Task 1/2 changes didn't alter `isRTL()`'s own decision logic, only how that decision gets painted.

- [ ] **Step 7: Record the result**

If all four messages in both panels pass, and toggle/config behavior is unchanged, the feature is done — no commit needed for this task (it produced no file changes). If something fails, note exactly which message/panel/step failed before returning to Task 1 or 2 to fix it.
