# CLAUDE.md — Pasquali

## What this project is

A Manifest V3 Chrome extension that corrects missing diacritics in Português BR and Deutsch as the user types. No build step, no bundler, no dependencies — all plain ES2020+ JavaScript loaded directly by Chrome.

## Architecture

```
manifest.json
  ├── background/service_worker.js   (SW context — no DOM access)
  ├── content/content.js             (page context — injected into every page)
  │     depends on rules/pt_BR.js and rules/de_DE.js (loaded first)
  └── popup/popup.html + popup.js    (extension popup)
```

### Message flow

```
popup.js ──SET_SETTINGS──► service_worker.js ──chrome.storage.sync.set──►
                                                                          ▼
content.js ◄──SETTINGS_CHANGED── popup.js  (direct tab message)
content.js ──GET_SETTINGS──► service_worker.js ──chrome.storage.sync.get──► content.js
```

### content.js internals

1. **Dictionary** — `buildDictionary()` merges the active language objects (`PASQUALI_PT_BR`, `PASQUALI_DE_DE`) into a flat `dictionary` object.
2. **Normalization** — `normalize(word)` strips all diacritics via NFD decomposition and lowercases, producing the dictionary lookup key.
3. **Capitalization** — `applyCapitalization(original, correction)` preserves ALL-CAPS and Title-Case from the original word.
4. **Framework detection** — `isFrameworkManaged(el)` checks for `__reactFiber$`, `__reactProps$`, `_vei` (Vue 3), `__vue` (Vue 2) properties on the DOM element. Framework-managed elements skip span injection entirely.
5. **Two correction paths**:
   - **Non-framework contenteditable**: span injection (`processTextNode` → `.pasquali-highlight` spans). A MutationObserver + debounced scan keeps highlights fresh as the user types.
   - **Framework contenteditable / textarea / input**: cursor-position lookup on right-click (`getWordAtCursorCE`, `getWordAtCursorTA`) followed by `execCommand('insertText', …)` or direct `.value` mutation.
6. **Context menu** — a single `<div id="pasquali-menu">` element is reused across all interactions. `mousedown` is prevented to avoid stealing focus from the active field.
7. **Caret preservation** — `saveCaret` / `restoreCaret` snapshot the cursor as a character offset and restore it after span injection rewrites DOM text nodes.

## Dictionary format (`rules/*.js`)

Each file exports a global constant (`PASQUALI_PT_BR`, `PASQUALI_DE_DE`) — a plain object:

```js
const PASQUALI_PT_BR = {
  // key: NFD-stripped, lowercase form
  // value: correct form with diacritics
  "nao": "não",
  "voce": "você",
};
```

The key is what `normalize(word)` returns. Adding a new entry: look at the section comments in the file (`// ── Formas verbais ──`) and place the entry in the right category, following the two-column alignment used throughout the file.

## Common tasks

### Add a new word

Edit `rules/pt_BR.js` or `rules/de_DE.js`. Key = diacritic-free lowercase; value = correct form. Reload the extension in `chrome://extensions` after saving.

### Reload after changes

In `chrome://extensions` click the refresh icon next to Pasquali, then hard-reload the target page (`Cmd+Shift+R`).

### Test right-click on a React page

Open the browser console, navigate to a React contenteditable, type an unaccented word (`voce`). Right-click the word — the Pasquali menu should appear. Span injection is intentionally suppressed; the menu must still appear and applying the correction must not cause a React reconciliation error.

### Disable for a specific element

The extension respects `SKIP_TAGS` (code, pre, textarea inside special contexts, etc.). To suppress highlighting for an element at runtime, set `data-pasquali-ignore` is not yet implemented — file an issue.

## Constraints to keep in mind

- **No build step.** Do not introduce a bundler, transpiler, or npm. All files are loaded directly by Chrome.
- **Manifest V3.** The service worker has no DOM access and a limited lifetime. All DOM work stays in `content.js`.
- **`execCommand` is deprecated** but remains the only reliable way to insert text into React/Vue inputs without bypassing their event system. Keep it until a better cross-framework API stabilises.
- **No `fetch` in content scripts.** Dictionaries are bundled as plain JS globals loaded via `content_scripts` in `manifest.json`, not fetched at runtime.
