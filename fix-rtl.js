#!/usr/bin/env node
/**
 * fix-rtl.js — Standalone RTL injection script (multi-editor)
 *
 * Injects RTL support into AI agent extensions across every VS Code-family
 * editor installed on this machine: VS Code, VS Code Insiders, Cursor,
 * Windsurf, Windsurf Next, Devin Desktop, and Google Antigravity.
 *
 * Usage:
 *   node fix-rtl.js              # apply
 *   node fix-rtl.js --dry-run    # show what would happen, change nothing
 *   node fix-rtl.js --restore    # undo everything, restore from backups
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const DRY_RUN = process.argv.includes("--dry-run");

const DEFAULT_CONFIG = {
    enabled: true,
    autoApplyOnStartup: true,
    font: { family: "Vazirmatn", scale: 1, lineHeight: 1.85 },
    detection: { mode: "ratio", threshold: 0.3 },
    applyToInput: true,
    showMessageToggles: true,
    keepCodeLeftToRight: true,
};

function parseConfigArg() {
    const arg = process.argv.find((a) => a.startsWith("--config="));
    if (!arg) return DEFAULT_CONFIG;
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(arg.slice("--config=".length)) };
    } catch {
        return DEFAULT_CONFIG;
    }
}

const CONFIG = parseConfigArg();
// Disabling the extension is just a restore: pull every patched file back
// to its pre-extension state and stop touching it.
const RESTORE = process.argv.includes("--restore") || CONFIG.enabled === false;

const MARKER = "// RTL AI Chats (injected)";
const WORKBENCH_MARKER = "/* RTL AI Chats (injected) */";

const SCRIPT_PATH = path.join(__dirname, "rtl-script.js");
const CSS_PATH = path.join(__dirname, "rtl-workbench.css");
const FONT_DIR = path.join(__dirname, "assets", "fonts");

// ── Bundled fonts ──────────────────────────────────────────────────────────────
// AI chat webviews (Claude Code, Codex, Gemini) ship a CSP with
// `font-src ${cspSource}` and no `data:` — so a base64 @font-face is silently
// blocked. The only origin that's allowed is the extension's own webview
// folder, so we physically copy the .woff2 next to the patched file and
// reference it with a relative url() instead.

const BUNDLED_FONT_FILES = {
    Vazirmatn: { regular: "Vazirmatn-Regular.woff2", bold: "Vazirmatn-Bold.woff2" },
    Sahel: { regular: "Sahel-Regular.woff2", bold: "Sahel-Bold.woff2" },
};
const FONT_COPY_NAMES = { regular: "rtl-ai-chats-font-regular.woff2", bold: "rtl-ai-chats-font-bold.woff2" };

function copyFontsNextTo(targetDir) {
    const files = BUNDLED_FONT_FILES[CONFIG.font.family];
    if (!files) return false;
    try {
        fs.copyFileSync(path.join(FONT_DIR, files.regular), path.join(targetDir, FONT_COPY_NAMES.regular));
        fs.copyFileSync(path.join(FONT_DIR, files.bold), path.join(targetDir, FONT_COPY_NAMES.bold));
        return true;
    } catch {
        return false;
    }
}

function removeFontsFrom(targetDir) {
    try {
        fs.unlinkSync(path.join(targetDir, FONT_COPY_NAMES.regular));
    } catch {}
    try {
        fs.unlinkSync(path.join(targetDir, FONT_COPY_NAMES.bold));
    } catch {}
}

function buildFontFaceCss() {
    if (!BUNDLED_FONT_FILES[CONFIG.font.family]) return "";
    const family = CONFIG.font.family;
    return (
        `@font-face{font-family:'${family}';font-weight:400;font-style:normal;font-display:swap;` +
        `src:url('./${FONT_COPY_NAMES.regular}') format('woff2');}\n` +
        `@font-face{font-family:'${family}';font-weight:700;font-style:normal;font-display:swap;` +
        `src:url('./${FONT_COPY_NAMES.bold}') format('woff2');}\n`
    );
}

const FONT_FACE_CSS = buildFontFaceCss();

// ── Editors this script knows about ───────────────────────────────────────────
// `extDir` is the dot-folder under $HOME that holds `extensions/`.
// `macApp` / `winProgram` are used to locate each editor's own workbench.html
// (for chat panels that are built into the editor itself, not shipped as a
// separate extension — e.g. Antigravity's native Gemini agent panel).

const EDITORS = [
    { name: "VS Code", extDir: ".vscode", macApp: "Visual Studio Code.app", winProgram: "Microsoft VS Code" },
    { name: "VS Code Insiders", extDir: ".vscode-insiders", macApp: "Visual Studio Code - Insiders.app", winProgram: "Microsoft VS Code Insiders" },
    { name: "Cursor", extDir: ".cursor", macApp: "Cursor.app", winProgram: "cursor" },
    { name: "Windsurf", extDir: ".windsurf", macApp: "Windsurf.app", winProgram: "Windsurf" },
    { name: "Windsurf Next", extDir: ".windsurf-next", macApp: "Windsurf Next.app", winProgram: "Windsurf Next" },
    { name: "Devin Desktop", extDir: ".devin", macApp: "Devin.app", winProgram: "Devin Desktop" },
    { name: "Antigravity", extDir: ".antigravity", macApp: "Antigravity.app", winProgram: "Antigravity" },
];

// ── Helper functions ──────────────────────────────────────────────────────────

function findLatestExtension(extensionsDir, prefix) {
    try {
        const dirs = fs
            .readdirSync(extensionsDir)
            .filter((d) => d.startsWith(prefix))
            .sort()
            .reverse();
        return dirs.length > 0 ? path.join(extensionsDir, dirs[0]) : null;
    } catch {
        return null;
    }
}

// Webview-based agent extensions to look for inside each editor's extensions/ dir
function findInjectionTargetsFor(editorLabel, extensionsDir) {
    const targets = [];

    const claudeDir = findLatestExtension(extensionsDir, "anthropic.claude-code-");
    if (claudeDir) {
        const p = path.join(claudeDir, "webview", "index.js");
        if (fs.existsSync(p)) targets.push({ name: `Claude Code (${editorLabel})`, path: p });
    }

    const codexDir = findLatestExtension(extensionsDir, "openai.chatgpt-");
    if (codexDir) {
        const htmlPath = path.join(codexDir, "webview", "index.html");
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, "utf8");
            const match = html.match(/src="\.\/assets\/(index-[^"]+\.js)"/);
            if (match) {
                const p = path.join(codexDir, "webview", "assets", match[1]);
                if (fs.existsSync(p)) targets.push({ name: `ChatGPT/Codex (${editorLabel})`, path: p });
            }
        }
    }

    const geminiDir = findLatestExtension(extensionsDir, "google.geminicodeassist-");
    if (geminiDir) {
        const p = path.join(geminiDir, "webview", "app_bundle.js");
        if (fs.existsSync(p)) targets.push({ name: `Gemini Code Assist (${editorLabel})`, path: p });
    }

    return targets;
}

function findAllInjectionTargets() {
    const targets = [];
    for (const editor of EDITORS) {
        const extensionsDir = path.join(os.homedir(), editor.extDir, "extensions");
        if (!fs.existsSync(extensionsDir)) continue;
        targets.push(...findInjectionTargetsFor(editor.name, extensionsDir));
    }
    return targets;
}

// Native chat panels built into the editor itself (Copilot Chat in VS Code,
// Antigravity's built-in Gemini agent panel, etc.) — patched via workbench.html
function findAllWorkbenches() {
    const found = [];

    const winWb = (dir) =>
        path.join(dir, "resources", "app", "out", "vs", "code", "electron-browser", "workbench", "workbench.html");
    const macWb = (dir) =>
        path.join(dir, "Contents", "Resources", "app", "out", "vs", "code", "electron-browser", "workbench", "workbench.html");

    for (const editor of EDITORS) {
        // Windows: C:\Users\<user>\AppData\Local\Programs\<winProgram>\<version>\...
        try {
            const winBase = path.join(os.homedir(), "AppData", "Local", "Programs", editor.winProgram);
            if (fs.existsSync(winBase)) {
                const versionDirs = fs.readdirSync(winBase).filter((d) => fs.existsSync(winWb(path.join(winBase, d))));
                if (versionDirs.length > 0) {
                    found.push({ name: editor.name, path: winWb(path.join(winBase, versionDirs[0])) });
                    continue;
                }
            }
        } catch {}

        // macOS: /Applications/<macApp>/Contents/Resources/app/...
        try {
            const macBase = path.join("/Applications", editor.macApp);
            if (fs.existsSync(macWb(macBase))) {
                found.push({ name: editor.name, path: macWb(macBase) });
            }
        } catch {}
    }

    return found;
}

function isInjected(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8").includes(MARKER);
    } catch {
        return false;
    }
}

function isWorkbenchInjected(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8").includes(WORKBENCH_MARKER);
    } catch {
        return false;
    }
}

// ── Webview injection ─────────────────────────────────────────────────────────

function injectWebview(target, scriptContent) {
    const { name, path: filePath } = target;

    if (!fs.existsSync(filePath)) {
        console.log(`[SKIP] ${name}: file not found\n       ${filePath}`);
        return;
    }

    const backupPath = filePath + ".rtl-backup";
    const targetDir = path.dirname(filePath);

    if (RESTORE) {
        if (fs.existsSync(backupPath)) {
            if (!DRY_RUN) {
                fs.copyFileSync(backupPath, filePath);
                removeFontsFrom(targetDir);
            }
            console.log(`[RESTORE] ${name}: restored from backup`);
        } else {
            console.log(`[SKIP] ${name}: no backup found`);
        }
        return;
    }

    const wasAlreadyInjected = isInjected(filePath);

    if (!fs.existsSync(backupPath)) {
        if (!DRY_RUN) fs.copyFileSync(filePath, backupPath);
        console.log(`[BAK]  ${name}: backup saved → ${path.basename(backupPath)}`);
    }

    if (!DRY_RUN) {
        let original = fs.readFileSync(filePath, "utf8");
        // Strip any previously-injected block first, so re-running always ends
        // up with the current script/config instead of silently keeping stale
        // content from a previous extension version.
        const markerBlock = `\n\n${MARKER}\n`;
        const markerIdx = original.indexOf(markerBlock);
        if (markerIdx !== -1) original = original.slice(0, markerIdx);

        const configSnippet = `window.__RTL_AI_CHATS_CONFIG__ = ${JSON.stringify(CONFIG)};\n`;
        let fontFaceSnippet = "";
        const fontFiles = BUNDLED_FONT_FILES[CONFIG.font.family];
        if (fontFiles && copyFontsNextTo(targetDir)) {
            // The bundled script is loaded as `type="module"`, so a plain
            // relative url() in CSS can resolve against the wrong base.
            // Resolve the two font files against this script's own (module)
            // URL at runtime instead — document.currentScript is always null
            // for modules, so fall back to the lone script[src] tag.
            fontFaceSnippet =
                `(function(){` +
                `var el=document.currentScript||document.querySelector('script[src]');` +
                `var base=el&&el.src?el.src:document.baseURI;` +
                `var reg=new URL(${JSON.stringify("./" + FONT_COPY_NAMES.regular)},base).href;` +
                `var bold=new URL(${JSON.stringify("./" + FONT_COPY_NAMES.bold)},base).href;` +
                `var fam=${JSON.stringify(CONFIG.font.family)};` +
                `var css="@font-face{font-family:'"+fam+"';font-weight:400;font-style:normal;font-display:swap;src:url('"+reg+"') format('woff2');}\\n"+` +
                `"@font-face{font-family:'"+fam+"';font-weight:700;font-style:normal;font-display:swap;src:url('"+bold+"') format('woff2');}\\n";` +
                `var s=document.createElement('style');s.id='rtl-ai-chats-fontface';s.textContent=css;` +
                `function inj(){(document.head||document.documentElement).appendChild(s);}` +
                `if(document.head){inj();}else{document.addEventListener('DOMContentLoaded',inj);}})();\n`;
        } else {
            removeFontsFrom(targetDir);
        }
        fs.writeFileSync(filePath, original + markerBlock + configSnippet + fontFaceSnippet + scriptContent + "\n", "utf8");
    }
    console.log(`[INJ]  ${name}: RTL script ${wasAlreadyInjected ? "refreshed" : "injected"}`);
}

// ── Workbench injection ───────────────────────────────────────────────────────

function injectWorkbench(target, cssContent) {
    const { name, path: workbenchPath } = target;

    if (!fs.existsSync(workbenchPath)) {
        console.log(`[SKIP] ${name} (workbench.html): file not found\n       ${workbenchPath}`);
        return;
    }

    const backupPath = workbenchPath + ".rtl-backup";

    if (RESTORE) {
        if (fs.existsSync(backupPath)) {
            if (!DRY_RUN) {
                fs.copyFileSync(backupPath, workbenchPath);
                removeFontsFrom(path.dirname(workbenchPath));
            }
            console.log(`[RESTORE] ${name} (workbench.html): restored from backup`);
        } else {
            console.log(`[SKIP] ${name}: no backup found`);
        }
        return;
    }

    const wasAlreadyInjected = isWorkbenchInjected(workbenchPath);

    if (!fs.existsSync(backupPath)) {
        if (!DRY_RUN) fs.copyFileSync(workbenchPath, backupPath);
        console.log(`[BAK]  ${name} (workbench.html): backup saved`);
    }

    let content = fs.readFileSync(workbenchPath, "utf8");

    // Remove old devin-custom-css RTL injection (from a previous extension) if present
    const sessionIdMarker = "<!-- !! DEVIN-CUSTOM-CSS-SESSION-ID";
    const cssEnd = "<!-- !! DEVIN-CUSTOM-CSS-END !! -->";
    const oldStart = content.indexOf(sessionIdMarker);
    if (oldStart !== -1) {
        const oldEnd = content.indexOf(cssEnd, oldStart);
        if (oldEnd !== -1) {
            content = content.substring(0, oldStart) + content.substring(oldEnd + cssEnd.length);
            console.log(`[CLN]  ${name}: removed old custom-css injection`);
        }
    }

    // Strip any previously-injected RTL block, so re-running always refreshes
    // to the current CSS/config instead of keeping stale content in place.
    const ownStartTag = `<!-- ${WORKBENCH_MARKER} -->`;
    const ownEndTag = "</style>\n";
    const ownStart = content.indexOf(ownStartTag);
    if (ownStart !== -1) {
        const ownEnd = content.indexOf(ownEndTag, ownStart);
        if (ownEnd !== -1) {
            content = content.slice(0, ownStart) + content.slice(ownEnd + ownEndTag.length);
        }
    }

    const fontStack =
        CONFIG.font.family === "System default"
            ? "inherit"
            : `'${CONFIG.font.family}', 'Sahel', 'Vazirmatn', sans-serif`;
    const varsBlock = `:root {\n  --rtl-ai-font-family: ${fontStack};\n  --rtl-ai-font-scale: ${CONFIG.font.scale};\n  --rtl-ai-line-height: ${CONFIG.font.lineHeight};\n}\n`;
    const workbenchDir = path.dirname(workbenchPath);
    let fontFaceCss = "";
    if (!DRY_RUN) {
        fontFaceCss = FONT_FACE_CSS && copyFontsNextTo(workbenchDir) ? FONT_FACE_CSS : "";
        if (!fontFaceCss) removeFontsFrom(workbenchDir);
    } else {
        fontFaceCss = FONT_FACE_CSS;
    }
    const injection = `\n<!-- ${WORKBENCH_MARKER} -->\n<style id="rtl-ai-chats">\n${fontFaceCss}${varsBlock}${cssContent}\n</style>\n`;
    if (!content.includes("</html>")) {
        content += injection;
    } else {
        content = content.replace("</html>", injection + "</html>");
    }

    if (!DRY_RUN) fs.writeFileSync(workbenchPath, content, "utf8");
    console.log(`[INJ]  ${name} (workbench.html): RTL CSS ${wasAlreadyInjected ? "refreshed" : "injected"}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
    if (DRY_RUN) console.log("[DRY RUN] No files will be modified\n");
    if (RESTORE && CONFIG.enabled === false) {
        console.log("[DISABLED] rtl-ai-chats.enabled is off — restoring all files from backups\n");
    } else if (RESTORE) {
        console.log("[RESTORE] Restoring all files from backups\n");
    }

    let scriptContent, cssContent;
    try {
        scriptContent = fs.readFileSync(SCRIPT_PATH, "utf8");
    } catch {
        console.error(`ERROR: Cannot read rtl-script.js at ${SCRIPT_PATH}`);
        process.exit(1);
    }
    try {
        cssContent = fs.readFileSync(CSS_PATH, "utf8");
    } catch {
        console.error(`ERROR: Cannot read rtl-workbench.css at ${CSS_PATH}`);
        process.exit(1);
    }

    console.log("=== Scanning installed editors ===");
    for (const editor of EDITORS) {
        const extensionsDir = path.join(os.homedir(), editor.extDir, "extensions");
        console.log(`${fs.existsSync(extensionsDir) ? "✓" : "·"} ${editor.name}`);
    }
    console.log("");

    // ── Webview-based agent extensions (Claude Code / Codex / Gemini Code Assist) ──
    const targets = findAllInjectionTargets();
    if (targets.length === 0) {
        console.log("[SKIP] No matching AI agent extensions found in any installed editor.");
    }
    for (const target of targets) {
        injectWebview(target, scriptContent);
    }

    // ── Native chat panels (Copilot Chat, Antigravity's built-in agent, etc.) ──────
    const workbenches = findAllWorkbenches();
    for (const wb of workbenches) {
        injectWorkbench(wb, cssContent);
    }

    console.log("\nDone!");
    if (!RESTORE) {
        console.log('Reload each open editor window to activate: "Developer: Reload Window"');
    }
}

main();
