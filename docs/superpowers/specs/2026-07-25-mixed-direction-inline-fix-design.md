# Mixed-direction inline fix — design

## Problem

`rtl-script.js` currently applies a blanket bidi override to every descendant of a matched
chat message:

```css
* {
    direction: inherit !important;
    unicode-bidi: embed !important;
}
```

This forces every DOM node into its own bidi embedding level in document order. Chat UIs
(Claude Code, Codex, Gemini Code Assist) frequently wrap streamed tokens in separate
`<span>` elements, so this override defeats the browser's native Unicode Bidi Algorithm
(UBA) instead of cooperating with it. Concretely, three patterns break inside an
otherwise-RTL Persian/Arabic/Hebrew message:

1. Numbers and punctuation mid-sentence (e.g. a percentage or date embedded in a Persian
   sentence).
2. Inline code / filenames mid-sentence (e.g. `` `index.js` `` referenced from a Persian
   sentence).
3. URLs mid-sentence.

All three are reported as equally important.

## Reference research

Two existing extensions solve overlapping problems:

- **`Foshati/rtl-agents`** (MIT) — Antigravity-only, block-level RTL classification, uses
  `unicode-bidi: isolate` for code. Does not address mixed-direction inline text.
- **`GuyRonnen/rtl-for-vs-code-agents`** (**GPLv3**) — solves this exact problem using
  `unicode-bidi: plaintext` on message containers plus an injected RLM (`‏`) character
  to anchor paragraph-direction detection, and `unicode-bidi: isolate` for forced-RTL
  elements.

Because that second project is GPLv3 and this project is MIT, its code must not be copied.
The technique itself (`plaintext` + RLM anchor + `isolate`) is a standard, uncopyrightable
Unicode Bidi pattern — this design re-implements it independently.

## Scope

In scope: the three webview-injected agent panels sharing `rtl-script.js` — Claude Code,
ChatGPT/Codex, Gemini Code Assist — across every editor that hosts them (VS Code, Cursor,
Windsurf, Devin Desktop, Antigravity).

Out of scope (follow-up candidate): native workbench panels patched via
`rtl-workbench.css` / `fix-rtl.js` (e.g. Copilot Chat, Antigravity's built-in agent panel).
Same technique applies there but is not part of this pass.

Detection logic (`isRTL()`, ratio/first-strong config, the manual per-message toggle via
`data-rtl-manual`, and the MutationObserver-driven reprocessing loop) is unchanged. This is
purely a change to *how* direction gets applied at the CSS/DOM level, not to *whether* a
given block is classified RTL.

## Design

### 1. Replace the blanket `embed` rule

Remove the `* { unicode-bidi: embed !important }` rule. In its place, apply
`unicode-bidi: plaintext !important` scoped to:

- the matched chat message containers (`CHAT_SELECTORS`), and
- their `p, li, h1, h2, h3, h4, h5, h6` descendants.

`plaintext` tells the browser to resolve each paragraph's direction via the real UBA based
on that paragraph's own first-strong character, instead of a single forced direction
fighting per-token embedding levels.

### 2. RLM anchoring

`applyRTL(el)` (in `rtl-script.js`) already knows, via `isRTL(text)`, that a block should
read RTL. If the paragraph's own first strong character is Latin (e.g. it opens with an
English word or filename), the browser's own `plaintext` resolution would independently
pick LTR, disagreeing with our classification. To prevent that: when `isRTL(text)` is true
and the text's first strong character is a Latin letter, insert an invisible RLM
(`‏`) at the start of the element's first text node. This anchors the UBA's own
paragraph-direction detection to RTL, in agreement with our classification.

Guard against double-injection using a `data-rtl-anchored="1"` attribute (mirrors the
existing `data-rtl-ai` bookkeeping pattern), and skip anchoring entirely if the user has
manually overridden the block (`data-rtl-manual="1"`).

### 3. Code isolation

Change `pre, code, .monaco-editor, .view-line` (and their `[data-rtl-ai="1"] …` variants)
from `unicode-bidi: embed` to `unicode-bidi: isolate`, keeping `direction: ltr` and
`text-align: left`. `isolate` is the correct construct for "this run must not affect
surrounding bidi reordering" — `embed` allows the surrounding context to influence it,
`isolate` does not.

This applies both to the static `<style>` block built in `rtl-script.js` and to the
per-element inline-style pass in `applyRTL()` / `processInputs()`.

### 4. Unchanged surfaces

- `isRTL()` (ratio / first-strong detection modes) and its config (`detection.mode`,
  `detection.threshold`).
- The manual toggle button (`.rtl-ai-toggle`) and `data-rtl-manual` override semantics.
- `processInputs()` direction-per-input logic (still whole-input RTL/LTR; per-line input
  handling is not part of this pass).
- The MutationObserver + polling reprocessing loop.

## Testing

No automated test suite exists in this repo; verification is manual, consistent with the
rest of the extension. Manual QA snippets to paste into each of the three panels (Claude
Code, Codex, Gemini) across at least one editor:

1. `درصد رشد ماهانه ۳۰٪ بوده و پیش‌بینی می‌کنیم تا پایان سال به ۵۰٪ برسه.` — RTL sentence
   with embedded Arabic-Indic/Latin digits and punctuation.
2. `برو تو فایل index.js تابع calculateTotal() رو پیدا کن و خط ۴۲ رو عوض کن.` — RTL
   sentence with embedded inline code/filenames.
3. `این مستندات رو از https://example.com/docs/api بخون و خلاصه کن.` — RTL sentence with
   an embedded URL.
4. A message that *opens* with a Latin word/filename but is otherwise RTL, e.g.
   `README.md رو باز کن و بخش نصب رو بخون.` — exercises RLM anchoring specifically.

Pass criteria: the RTL portions read right-to-left, the embedded LTR runs (numbers, code,
URLs) stay left-to-right and in their original left-to-right internal order, and the two
don't visually collide or reverse each other's order.

## Follow-up (not in this pass)

Apply the same `plaintext` + `isolate` pattern to `rtl-workbench.css` / `fix-rtl.js` for
native workbench-integrated chat panels (Copilot Chat, Antigravity's built-in agent).
