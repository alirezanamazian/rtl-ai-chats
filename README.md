# RTL for AI Chats

Automatic right-to-left (RTL) text support for AI coding assistant chat
panels across every VS Code-family editor.

Persian, Arabic, Urdu, Hebrew, and other RTL scripts render correctly and
align to the right, while code blocks, diffs, and terminals always stay
left-to-right — exactly like a native RTL chat app.

> Not affiliated with Anthropic, OpenAI, Google, or Microsoft. This is a
> community patch, not an official feature of any of those products.

## Why this exists

None of these editors natively support RTL rendering in their AI chat
panels. If you write to Claude Code, Codex, or Gemini in Persian, Arabic,
Hebrew, or Urdu, your text shows up left-aligned and often visually
scrambled — punctuation, numbers, and mixed-direction sentences render in
the wrong order. This extension fixes that by patching each chat's webview
(or, for chats built into the editor itself, its `workbench.html`) with
RTL-aware CSS and a small script that detects RTL text per element and
flips its direction, without touching code blocks, diffs, or terminal
output.

## What it does — features

- **Automatic RTL detection, per message.** Every chat bubble/element is
  inspected for RTL script; only the ones that actually contain RTL text
  get flipped. Mixed English/Persian messages, numbers, and punctuation are
  handled correctly instead of just blanket-mirroring the whole panel.
- **Code stays LTR, always.** Code blocks, inline code, diffs, and terminal
  panes are explicitly excluded from the RTL flip, so a Persian question
  followed by a JS snippet doesn't turn the snippet backwards.
- **Works across 7 editors, out of the box:** VS Code, VS Code Insiders,
  Cursor, Windsurf, Windsurf Next, Devin Desktop, and Google Antigravity —
  the extension scans `~/.vscode`, `~/.cursor`, `~/.windsurf`, etc. and
  patches whichever ones are actually installed.
- **Patches 4 AI chat surfaces:**

  | Target | How |
  |---|---|
  | Claude Code | `webview/index.js` in `anthropic.claude-code-*` |
  | ChatGPT / Codex | hashed bundle in `openai.chatgpt-*/webview/assets/` |
  | Gemini Code Assist | `webview/app_bundle.js` in `google.geminicodeassist-*` |
  | Copilot Chat / Antigravity's built-in agent | the editor's own `workbench.html` |

- **Self-healing.** Runs on startup, then watches every installed editor's
  `extensions/` folder live. If an editor or extension update overwrites
  the patch, it's silently re-applied automatically — you just get a
  one-click "Reload Window" prompt, no manual re-running required.
- **Safe by design.** Every file is backed up to `<file>.rtl-backup` before
  the first patch, so nothing is ever modified without a way back.
- **One-command restore.** Undo every patch across every editor and go back
  to a completely clean, unmodified state — useful before uninstalling or
  updating the base editor.
- **In-editor status view.** See exactly what's patched vs. broken, per
  editor and per chat surface, with a one-click fix.
- **A full Settings panel**, in the Activity Bar — toggle RTL on/off, pick a
  font (Vazirmatn, Sahel, or your system default), tune size/line-height,
  choose how direction is detected, and re-apply/restore without touching
  the Command Palette. See [Settings](#settings) below.
- **No extension required, if you'd rather not install one.** Everything
  the extension does is also available as a standalone script you can run
  by hand or from your own tooling.

## Install

**One-shot (recommended) — builds the `.vsix` once and installs it into
every editor found on your machine:**

```bash
chmod +x install.sh
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

**No-install alternative** (just run the patch script directly, no
extension needed):

```bash
node fix-rtl.js            # apply
node fix-rtl.js --dry-run  # preview only, no changes
node fix-rtl.js --restore  # undo everything
```

## Commands (inside the editor)

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
`Settings → Extensions → RTL for AI Chats`. Changing any setting re-applies
the patch automatically across every installed editor.

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
