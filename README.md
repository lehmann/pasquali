# Pasquali

**Pasquali** is a browser extension that silently corrects diacritical characters as you type — accents, cedilla, Umlaut, and Eszett — in Português BR and Deutsch.

It works anywhere you can edit text in the browser: `contenteditable` elements, `<textarea>`, and `<input>` fields.

---

## Features

- **Inline highlights** — misspelled words are underlined in-place with a gentle squiggle.
- **Right-click to fix** — right-click any highlighted word to see the correction and apply it with one click.
- **Framework-aware** — React and Vue contenteditable fields are handled via `execCommand` so their synthetic event system stays in sync; span injection is skipped for those elements.
- **Per-language toggle** — enable PT-BR, DE, or both independently via the popup.
- **Sync storage** — settings are stored in `chrome.storage.sync`, so they follow you across devices.

## Supported languages

| Code | Language | What it fixes |
|------|----------|---------------|
| `pt_BR` | Português Brasileiro | accents (agudo, circunflexo, til), cedilha, common internet slang forms (`eh` → `é`, `tah` → `tá`, …) |
| `de_DE` | Deutsch | Umlaut (`ae→ä`, `oe→ö`, `ue→ü`) and Eszett (`ss→ß`) |

## Installation (unpacked extension)

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project root directory.
5. The Pasquali icon appears in the toolbar. Click it to open the settings popup.

## Project layout

```
pasquali/
├── manifest.json           # Manifest V3 extension descriptor
├── background/
│   └── service_worker.js   # Handles storage get/set messages
├── content/
│   ├── content.js          # Core logic: scan, highlight, correct
│   └── content.css         # Highlight and context-menu styles
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.js            # Popup logic (settings read/write)
│   └── popup.css           # Popup styles
├── rules/
│   ├── pt_BR.js            # PT-BR dictionary (PASQUALI_PT_BR)
│   └── de_DE.js            # DE dictionary   (PASQUALI_DE_DE)
└── icons/
    └── icon.svg            # Extension icon
```

## Adding words to a dictionary

Open the appropriate file in `rules/` and add an entry following the existing pattern:

```js
// key: normalized form (no diacritics, lowercase)
// value: correct form with diacritics
"palavra": "palavrá",
```

The key must be the output of `word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')` — that is, the word stripped of all diacritical marks and lowercased. Capitalization is restored automatically at runtime.

## License

MIT
