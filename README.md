<div align="center">

<img src="icon.png" width="88" alt="RTL for AI Chats" />

# RTL for AI Chats

**Your AI assistant already speaks Persian, Arabic, Urdu, and Hebrew.**
**Now its chat panel finally reads that way too.**

![License](https://img.shields.io/badge/License-MIT-blue)
![Open VSX](https://img.shields.io/open-vsx/v/alirezanamazian/rtl-ai-chats?label=Open%20VSX)
![Editors](https://img.shields.io/badge/editors-7%20supported-8b5cf6)
![Not affiliated](https://img.shields.io/badge/affiliation-unofficial%20community%20patch-lightgrey)

</div>

---

> None of these editors natively render RTL script in their AI chat panels —
> a Persian question shows up left-aligned, punctuation scrambled, numbers
> flipped. **RTL for AI Chats** patches the chat itself so it just reads
> correctly, everywhere you use it, without you doing anything after setup.

```diff
- Persian/Arabic replies render left-aligned, punctuation and numbers scrambled
+ Every RTL message snaps right-aligned, reading in the correct direction

- Code snippets inside an RTL answer get mirrored along with the text
+ Code blocks, diffs, and terminals always stay left-to-right, untouched

- An editor or extension update silently undoes any manual fix you made
+ The patch watches for updates and re-applies itself automatically
```

## Features

- **Detects direction per message, not per panel.** Each chat element is
  checked for RTL script on its own — mixed Persian/English messages,
  inline numbers, and punctuation all render correctly instead of the whole
  panel just being blanket-mirrored.
- **Two detection modes.** `ratio` (smart — flips once enough of a
  message's letters are RTL, tunable by threshold) or `first-strong`
  (matches the browser's native `dir="auto"` behavior).
- **Code never flips.** Code blocks, inline code, diffs, and terminal panes
  are explicitly excluded, so a Persian question followed by a JS snippet
  doesn't turn the snippet backwards.
- **Runs across 7 editors out of the box:** VS Code, VS Code Insiders,
  Cursor, Windsurf, Windsurf Next, Devin Desktop, and Google Antigravity —
  it scans `~/.vscode`, `~/.cursor`, `~/.windsurf`, etc. and patches
  whichever ones are actually installed on your machine.
- **Patches 4 AI chat surfaces:**

  | Target | How |
  |---|---|
  | Claude Code | `webview/index.js` in `anthropic.claude-code-*` |
  | ChatGPT / Codex | hashed bundle in `openai.chatgpt-*/webview/assets/` |
  | Gemini Code Assist | `webview/app_bundle.js` in `google.geminicodeassist-*` |
  | Copilot Chat / Antigravity's built-in agent | the editor's own `workbench.html` |

- **Self-healing.** Watches every installed editor's `extensions/` folder
  live — the moment an update overwrites the patch, it's silently
  re-applied and you just get a one-click "Reload Window" prompt.
- **Fully configurable**, from a settings panel in the Activity Bar or the
  standard Settings UI — font, size, line-height, detection mode and
  threshold, per-message override toggle, and more. See
  [Settings](#settings).
- **Safe by design.** Every file is backed up to `<file>.rtl-backup` before
  the first patch, and one command restores everything, everywhere.
- **No extension required, if you'd rather not install one.** Every part of
  what the extension does is also a standalone script you can run by hand.

## Install

**From Open VSX** (Cursor, Windsurf, VSCodium, and other Open VSX-backed
editors): search **"RTL for AI Chats"** in Extensions, or open the
[listing](https://open-vsx.org/extension/alirezanamazian/rtl-ai-chats)
directly and click **Install**.

> VS Code Marketplace listing is pending review — until then, use Open VSX
> or install the `.vsix` manually below.

**One-shot script** — builds the `.vsix` once and installs it into every
editor found on your machine:

```bash
./install.sh
```

**Manual, per editor:**

```bash
npm install -g @vscode/vsce
vsce package
```

Then in each editor: `Extensions` → `…` menu → `Install from VSIX...` →
select the generated `rtl-ai-chats-*.vsix`, then run
`Developer: Reload Window`.

**No-install alternative** — run the patch script directly, no extension
needed:

```bash
node fix-rtl.js            # apply
node fix-rtl.js --dry-run  # preview only, no changes
node fix-rtl.js --restore  # undo everything
```

## Commands

Open the Command Palette (`Cmd/Ctrl+Shift+P`) and run:

- **RTL: Re-inject into All AI Agents** — force a re-patch right now, across
  every installed editor and chat surface.
- **RTL: Show Injection Status** — see what's patched vs. broken, per
  editor, with a one-click "Fix Now" if anything's out of date.
- **RTL: Restore Original (Undo All Patches)** — revert every patched file
  from its backup. Run this before uninstalling.
- **RTL: Turn On / Off** — toggle everything without opening Settings.
- **RTL: Show / Hide Sidebar Panel** — show or hide the Activity Bar icon.
- **RTL: Open Settings** — jump straight to this extension's settings.

## Settings

Click the RTL icon in the Activity Bar for a settings panel, or open
`Settings → Extensions → RTL for AI Chats`. Changing any setting that
affects the patch re-applies it automatically across every installed
editor.

| Setting | Default | What it does |
|---|---|---|
| `rtl-ai-chats.enabled` | `true` | Master on/off switch. Turning it off restores every patched file to its original state. |
| `rtl-ai-chats.autoApplyOnStartup` | `true` | Re-apply automatically on startup and after updates. |
| `rtl-ai-chats.showInActivityBar` | `true` | Show/hide the Activity Bar panel. |
| `rtl-ai-chats.showStatusBar` | `true` | Show/hide the on/off item in the status bar. |
| `rtl-ai-chats.font.family` | `Vazirmatn` | Font for RTL text — `Vazirmatn`, `Sahel`, or `System default`. Must be installed on your system to take effect; otherwise it falls back automatically. |
| `rtl-ai-chats.font.scale` | `1` | Size of RTL text relative to the chat's default. |
| `rtl-ai-chats.font.lineHeight` | `1.85` | Line spacing for RTL text. |
| `rtl-ai-chats.detection.mode` | `ratio` | `ratio` (smart: flips once enough of a message's letters are RTL) or `first-strong` (flips based on the first strong-directional character, like the browser's native `dir="auto"`). |
| `rtl-ai-chats.detection.threshold` | `0.3` | `ratio` mode only — minimum share (0.1–0.7) of RTL letters needed to flip a message. |
| `rtl-ai-chats.applyToInput` | `true` | Also flip the message box to RTL as you type. |
| `rtl-ai-chats.showMessageToggles` | `true` | Show a small ⇄ button on each message to override its direction by hand. |
| `rtl-ai-chats.keepCodeLeftToRight` | `true` | Keep code blocks, diffs, and terminals left-to-right. |

## Staying patched after updates

The extension activates on startup and also watches every installed
editor's `extensions/` folder live — if an editor or AI-agent extension
update overwrites the patch (which happens on auto-update, since it
overwrites the webview bundle), it's detected and re-applied automatically.
You just get a prompt to reload the window; no manual steps needed.

## Uninstalling

Run **RTL: Restore Original (Undo All Patches)** (or `node fix-rtl.js
--restore`) first to revert every patched file to its pre-extension state,
then uninstall the extension normally from each editor.

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center"><sub>Not affiliated with Anthropic, OpenAI, Google, or Microsoft — an unofficial community patch.</sub></div>
