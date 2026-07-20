#!/bin/bash
# install.sh — Build the .vsix once, install it into every VS Code-family
# editor CLI that's found on this machine (only the ones actually installed).
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1) Make sure vsce is available ────────────────────────────────────────────
if ! command -v vsce &> /dev/null; then
    echo -e "${YELLOW}Installing @vscode/vsce (one-time)...${NC}"
    npm install -g @vscode/vsce
fi

# ── 2) Package the extension ──────────────────────────────────────────────────
echo -e "${YELLOW}Packaging extension...${NC}"
vsce package --allow-missing-repository --skip-license 2>/dev/null || vsce package
VSIX_FILE=$(ls -t rtl-ai-chats-*.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo -e "${RED}Packaging failed — no .vsix was produced.${NC}"
    exit 1
fi
echo -e "${GREEN}Built: $VSIX_FILE${NC}"
echo ""

# ── 3) Install into every editor CLI that's actually on this machine ─────────
# Each of these is the CLI binary name for its editor's "Install from VSIX"
# equivalent. Editors not installed simply won't have their command in PATH,
# so they're silently skipped.
CLIS=(
    "code:VS Code"
    "code-insiders:VS Code Insiders"
    "cursor:Cursor"
    "windsurf:Windsurf"
    "devin:Devin Desktop"
    "antigravity:Antigravity"
)

installed=0
for entry in "${CLIS[@]}"; do
    cmd="${entry%%:*}"
    label="${entry##*:}"
    if command -v "$cmd" &> /dev/null; then
        echo -e "${YELLOW}Installing into $label...${NC}"
        if "$cmd" --install-extension "$VSIX_FILE" --force &> /dev/null; then
            echo -e "${GREEN}[OK]${NC} $label"
            installed=$((installed + 1))
        else
            echo -e "${RED}[FAIL]${NC} $label (CLI found but install failed)"
        fi
    else
        echo -e "·  $label CLI not found — skipped (editor not installed, or its CLI isn't on PATH)"
    fi
done

echo ""
if [ "$installed" -eq 0 ]; then
    echo -e "${RED}No supported editor CLI found on PATH.${NC}"
    echo "Open each editor manually → Extensions → \"...\" menu → Install from VSIX → select $VSIX_FILE"
else
    echo -e "${GREEN}Installed into $installed editor(s).${NC}"
    echo "Reload each open editor window (\"Developer: Reload Window\") to activate RTL."
fi
