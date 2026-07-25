"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const MARKER = "// RTL AI Chats (injected)";
const WORKBENCH_MARKER = "/* RTL AI Chats (injected) */";
const CONFIG_SECTION = "rtl-ai-chats";

const EDITORS = [
    { name: "VS Code", extDir: ".vscode", macApp: "Visual Studio Code.app", winProgram: "Microsoft VS Code" },
    { name: "VS Code Insiders", extDir: ".vscode-insiders", macApp: "Visual Studio Code - Insiders.app", winProgram: "Microsoft VS Code Insiders" },
    { name: "Cursor", extDir: ".cursor", macApp: "Cursor.app", winProgram: "cursor" },
    { name: "Windsurf", extDir: ".windsurf", macApp: "Windsurf.app", winProgram: "Windsurf" },
    { name: "Windsurf Next", extDir: ".windsurf-next", macApp: "Windsurf Next.app", winProgram: "Windsurf Next" },
    { name: "Devin Desktop", extDir: ".devin", macApp: "Devin.app", winProgram: "Devin Desktop" },
    { name: "Antigravity", extDir: ".antigravity", macApp: "Antigravity.app", winProgram: "Antigravity" },
];

let watchers = [];
let debounceTimer = null;
let statusBarItem = null;

// ── Config ──────────────────────────────────────────────────────────────────

function readConfig() {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return {
        enabled: cfg.get("enabled", true),
        autoApplyOnStartup: cfg.get("autoApplyOnStartup", true),
        showInActivityBar: cfg.get("showInActivityBar", true),
        showStatusBar: cfg.get("showStatusBar", true),
        font: {
            family: cfg.get("font.family", "Vazirmatn"),
            scale: cfg.get("font.scale", 1),
            lineHeight: cfg.get("font.lineHeight", 1.85),
        },
        detection: {
            mode: cfg.get("detection.mode", "ratio"),
            threshold: cfg.get("detection.threshold", 0.3),
        },
        applyToInput: cfg.get("applyToInput", true),
        showMessageToggles: cfg.get("showMessageToggles", true),
        keepCodeLeftToRight: cfg.get("keepCodeLeftToRight", true),
    };
}

function setConfigValue(key, value) {
    return vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .update(key, value, vscode.ConfigurationTarget.Global);
}

// ── Target discovery (same logic as fix-rtl.js, kept in sync) ────────────────

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

function findAllWorkbenches() {
    const found = [];
    const winWb = (dir) =>
        path.join(dir, "resources", "app", "out", "vs", "code", "electron-browser", "workbench", "workbench.html");
    const macWb = (dir) =>
        path.join(dir, "Contents", "Resources", "app", "out", "vs", "code", "electron-browser", "workbench", "workbench.html");

    for (const editor of EDITORS) {
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

// ── Fix / restore script runner ────────────────────────────────────────────────

function runScript(extensionPath, args, onDone) {
    const fixScript = path.join(extensionPath, "fix-rtl.js");
    const config = readConfig();
    const fullArgs = [fixScript, ...args, `--config=${JSON.stringify(config)}`];
    execFile("node", fullArgs, (error) => {
        if (error) {
            vscode.window.showErrorMessage(`RTL AI Chats: ${error.message}`);
            return;
        }
        if (onDone) onDone();
    });
}

function offerReload(message) {
    vscode.window.showInformationMessage(message, "Reload Window").then((choice) => {
        if (choice === "Reload Window") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
    });
}

// ── Status (manual command) ───────────────────────────────────────────────────

function buildStatusLines() {
    const targets = findAllInjectionTargets();
    const workbenches = findAllWorkbenches();

    const lines = ["RTL AI Chats — Injection Status\n"];
    targets.forEach((t) => lines.push(`${isInjected(t.path) ? "✓" : "✗"} ${t.name}`));
    workbenches.forEach((w) =>
        lines.push(`${isWorkbenchInjected(w.path) ? "✓" : "✗"} ${w.name} (native chat panel)`),
    );
    if (targets.length === 0 && workbenches.length === 0) {
        lines.push("No supported editors or AI agent extensions found on this machine.");
    }
    return lines;
}

function showStatus(extensionPath) {
    const lines = buildStatusLines();
    const broken = lines.filter((l) => l.startsWith("✗")).length;
    if (broken > 0) {
        vscode.window.showWarningMessage(lines.join("\n"), "Fix Now").then((choice) => {
            if (choice === "Fix Now") runScript(extensionPath, [], () => offerReload("RTL support re-applied."));
        });
    } else {
        vscode.window.showInformationMessage(lines.join("\n"));
    }
    return lines;
}

// ── Automatic detection + silent fix ──────────────────────────────────────────

function isAnythingBroken() {
    const targets = findAllInjectionTargets();
    const workbenches = findAllWorkbenches();
    return (
        targets.some((t) => !isInjected(t.path)) ||
        workbenches.some((w) => !isWorkbenchInjected(w.path))
    );
}

function autoFix(extensionPath) {
    const config = readConfig();
    if (!config.enabled) return;
    if (!config.autoApplyOnStartup) return;
    if (!isAnythingBroken()) return;
    runScript(extensionPath, [], () =>
        offerReload(
            "RTL support was reset by an editor/extension update — re-applied automatically. Reload to activate.",
        ),
    );
}

function scheduleAutoFix(extensionPath) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => autoFix(extensionPath), 1500);
}

// ── Live watchers across every installed editor ───────────────────────────────

function startWatchers(extensionPath) {
    for (const editor of EDITORS) {
        const extensionsDir = path.join(os.homedir(), editor.extDir, "extensions");
        if (!fs.existsSync(extensionsDir)) continue;
        try {
            const w = fs.watch(extensionsDir, { recursive: true }, () => scheduleAutoFix(extensionPath));
            watchers.push(w);
        } catch {
            // Recursive watch unsupported on this platform/filesystem for this editor.
            // The periodic fallback below still catches it.
        }
    }
    const interval = setInterval(() => autoFix(extensionPath), 60000);
    watchers.push({ close: () => clearInterval(interval) });
}

// ── Status bar ─────────────────────────────────────────────────────────────────

function refreshStatusBar() {
    const config = readConfig();
    if (!config.showStatusBar) {
        if (statusBarItem) statusBarItem.hide();
        return;
    }
    if (!statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
        statusBarItem.command = "rtl-ai-chats.toggle";
    }
    statusBarItem.text = config.enabled ? "$(text-size) RTL: On" : "$(text-size) RTL: Off";
    statusBarItem.tooltip = "RTL for AI Chats — click to toggle";
    statusBarItem.show();
}

// ── Sidebar panel (webview view) ────────────────────────────────────────────────

class RtlPanelProvider {
    constructor(extensionUri, extensionPath) {
        this.extensionUri = extensionUri;
        this.extensionPath = extensionPath;
        this.view = null;
    }

    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        const htmlPath = path.join(this.extensionPath, "media", "panel.html");
        webviewView.webview.html = fs.readFileSync(htmlPath, "utf8");

        webviewView.webview.onDidReceiveMessage((msg) => {
            switch (msg.type) {
                case "ready":
                    this.postConfig();
                    break;
                case "setConfig":
                    setConfigValue(msg.key, msg.value);
                    break;
                case "reinject":
                    if (!readConfig().enabled) {
                        vscode.window.showWarningMessage("RTL for AI Chats is turned off. Enable it above first.");
                        break;
                    }
                    runScript(this.extensionPath, [], () => offerReload("RTL support re-applied."));
                    break;
                case "restore":
                    runScript(this.extensionPath, ["--restore"], () =>
                        offerReload("Original files restored. Reload to see the un-patched chat."),
                    );
                    break;
                case "checkStatus":
                    webviewView.webview.postMessage({
                        type: "statusText",
                        text: buildStatusLines().join("\n"),
                    });
                    break;
            }
        });
    }

    postConfig() {
        if (this.view) {
            this.view.webview.postMessage({ type: "config", config: readConfig() });
        }
    }
}

// ── VS Code / Devin Desktop / Antigravity extension API ───────────────────────

function activate(context) {
    const extPath = context.extensionPath;

    const panelProvider = new RtlPanelProvider(context.extensionUri, extPath);

    refreshStatusBar();
    setTimeout(() => autoFix(extPath), 4000);
    startWatchers(extPath);

    context.subscriptions.push(
        { dispose: () => watchers.forEach((w) => w.close && w.close()) },
        vscode.window.registerWebviewViewProvider("rtlAiChats.panel", panelProvider),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration(CONFIG_SECTION)) return;
            refreshStatusBar();
            panelProvider.postConfig();

            // Only settings that change what gets written into the injected
            // script/CSS are worth a re-patch + reload prompt. Cosmetic ones
            // (status bar, activity bar, autoApplyOnStartup) apply on their own.
            const INJECTION_AFFECTING_KEYS = [
                "enabled",
                "font.family",
                "font.scale",
                "font.lineHeight",
                "detection.mode",
                "detection.threshold",
                "applyToInput",
                "showMessageToggles",
                "keepCodeLeftToRight",
            ];
            const needsReinject = INJECTION_AFFECTING_KEYS.some((key) =>
                e.affectsConfiguration(`${CONFIG_SECTION}.${key}`),
            );
            if (!needsReinject) return;

            if (e.affectsConfiguration(`${CONFIG_SECTION}.enabled`)) {
                const config = readConfig();
                runScript(extPath, config.enabled ? [] : ["--restore"], () =>
                    offerReload(config.enabled ? "RTL support enabled." : "RTL support disabled — original files restored."),
                );
            } else {
                runScript(extPath, [], () => offerReload("RTL settings changed — re-applied."));
            }
        }),
        vscode.commands.registerCommand("rtl-ai-chats.reinjectAll", () => {
            if (!readConfig().enabled) {
                vscode.window
                    .showWarningMessage("RTL for AI Chats is turned off.", "Turn On")
                    .then((choice) => {
                        if (choice === "Turn On") setConfigValue("enabled", true);
                    });
                return;
            }
            runScript(extPath, [], () => offerReload("RTL support re-applied."));
        }),
        vscode.commands.registerCommand("rtl-ai-chats.checkStatus", () => showStatus(extPath)),
        vscode.commands.registerCommand("rtl-ai-chats.restoreOriginal", () =>
            runScript(extPath, ["--restore"], () =>
                offerReload("Original files restored. Reload to see the un-patched chat."),
            ),
        ),
        vscode.commands.registerCommand("rtl-ai-chats.toggle", () => {
            const config = readConfig();
            setConfigValue("enabled", !config.enabled);
        }),
        vscode.commands.registerCommand("rtl-ai-chats.toggleSidebar", () => {
            const config = readConfig();
            setConfigValue("showInActivityBar", !config.showInActivityBar);
        }),
        vscode.commands.registerCommand("rtl-ai-chats.openSettings", () =>
            vscode.commands.executeCommand("workbench.action.openSettings", CONFIG_SECTION),
        ),
    );
}

function deactivate() {
    watchers.forEach((w) => w.close && w.close());
    if (statusBarItem) statusBarItem.dispose();
}

module.exports = { activate, deactivate };
