/* global PASQUALI_PT_BR, PASQUALI_DE_DE */

// ── State ────────────────────────────────────────────────────────────────────

let isEnabled = true;
let activeLanguages = ['pt_BR', 'de_DE'];
let dictionary = {};

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'MATH', 'SVG',
  'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT']);

// ── Dictionary ────────────────────────────────────────────────────────────────

// Keys where stripping ae→a / oe→o / ue→u would produce a different valid German word.
const DE_UMLAUT_EXPANSION_SKIP = new Set([
  // ae→a conflicts
  'andern',   // andere (pl dative)
  'backt',    // alt. form of bäckt
  'bar',      // Bar = pub/cash
  'bewahren', // bewahren = to preserve (vs. bewähren)
  'brat',     // imperative of braten
  'fahrt',    // Fahrt = journey
  'fallt',    // ihr fallt = 2nd pl of fallen
  'halt',     // Halt = stop!
  'hatte',    // hatte = had (vs. hätte)
  'hatten',   // hatten = had (pl)
  'hattest',  // hattest = had (2nd sg)
  'kamen',    // kamen = came
  'kalte',    // kalte = cold (adj)
  'kalter',   // kalter = cold (adj)
  'lange',    // lange = long (adv)
  'langer',   // langer = long (adj form)
  'lasst',    // ihr lasst = 2nd pl of lassen
  'lauft',    // lauft = 2nd pl of laufen
  'nahmen',   // nahmen = took (pl)
  'naher',    // naher = near (Naher Osten)
  'rat',      // Rat = council
  'schlaft',  // ihr schlaft
  'schlagt',  // ihr schlagt
  'starke',   // starke = strong (adj)
  'starker',  // starker = strong (adj)
  'taten',    // Taten = deeds (pl of Tat)
  'tragt',    // ihr tragt
  'vater',    // Vater = father (sg)
  'wachst',   // ihr wachst
  'wahlen',   // Wahlen = elections
  'ware',     // Ware = goods
  'waren',    // waren = were / Waren = goods
  'warst',    // warst = were (2nd sg)
  'wascht',   // ihr wascht
  // oe→o conflicts
  'hohe',     // hohe = high (adj, vs. Höhe = height)
  'hoher',    // hoher = high (adj, vs. höher = higher)
  'hohle',    // hohle = hollow (adj, vs. Höhle = cave)
  'konnte',   // konnte = could (past, vs. könnte)
  'konnten',  // konnten = could (past pl)
  'konntest', // konntest = could (past 2nd sg)
  'losung',   // Losung = slogan/password
  'losungen', // Losungen
  'mochte',   // mochte = liked (past, vs. möchte)
  'mochten',  // mochten = liked (past pl)
  'mochtest', // mochtest
  'schon',    // schon = already
  'schone',   // schone = spare/protect (verb)
  'tochter',  // Tochter = daughter (sg, vs. Töchter pl)
  'vogel',    // Vogel = bird (sg, vs. Vögel pl)
  'volker',   // Volker = German given name
  // ue→u conflicts
  'durfte',   // durfte = was allowed (past, vs. dürfte)
  'durften',  // durften = were allowed (past pl)
  'fuhren',   // fuhren = drove (past pl, vs. führen)
  'musste',   // musste = had to (past, vs. müsste)
  'mussten',  // mussten = had to (past pl)
  'mutter',   // Mutter = mother (sg, vs. Mütter pl)
  'stuck',    // Stuck = stucco (vs. Stück = piece)
  'wurde',    // wurde = became (past, vs. würde)
  'wurden',   // wurden = became (past pl)
  'wurdest',  // wurdest = became (2nd sg past)
  'wust',     // Wust = chaos/mess (vs. wüst)
]);

function expandDeUmlautVariants() {
  for (const [key, value] of Object.entries(PASQUALI_DE_DE)) {
    const stripped = key.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
    if (stripped !== key && !dictionary[stripped] && !DE_UMLAUT_EXPANSION_SKIP.has(stripped)) {
      dictionary[stripped] = value;
    }
  }
}

function buildDictionary() {
  dictionary = {};
  if (activeLanguages.includes('pt_BR')) Object.assign(dictionary, PASQUALI_PT_BR);
  if (activeLanguages.includes('de_DE')) {
    Object.assign(dictionary, PASQUALI_DE_DE);
    expandDeUmlautVariants();
  }
}

function normalize(word) {
  return word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function applyCapitalization(original, correction) {
  if (!original || !correction) return correction;
  if (original === original.toUpperCase() && original.length > 1) return correction.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return correction[0].toUpperCase() + correction.slice(1);
  return correction;
}

function lookupWord(word) {
  if (!word || word.length < 2) return null;
  const canonical = dictionary[normalize(word)];
  if (!canonical) return null;
  const correction = applyCapitalization(word, canonical);
  return word === correction ? null : correction;
}

// ── Framework detection ───────────────────────────────────────────────────────
// React (and similar) manage the DOM via virtual-DOM reconciliation. Injecting
// <span> nodes into their contenteditable causes immediate reversion. We detect
// this and fall back to contextmenu-only mode (no span injection, but right-click
// correction still works via Selection + execCommand).

function isFrameworkManaged(el) {
  // Lexical editor: sets data-lexical-editor on the CE root.
  if (el.hasAttribute('data-lexical-editor')) return true;

  // Rich-text editors (Lexical, Draft.js, ProseMirror, TipTap, Quill …) structure
  // paragraphs as block children (div, p) of the CE root. Plain contenteditables
  // have only text nodes, <br>, and inline elements — never block children.
  if (el.querySelector(':scope > div, :scope > p')) return true;

  // React/Vue may attach fiber/vnode keys to a wrapper ancestor rather than
  // the CE element itself — walk up a few levels to catch that.
  let node = el;
  for (let i = 0; i < 5 && node && node !== document.documentElement; i++) {
    if (Object.keys(node).some(k =>
      k.startsWith('__reactFiber$') ||
      k.startsWith('__reactProps$') ||
      k.startsWith('__reactEvents$') ||
      k.startsWith('_vei') ||        // Vue 3
      k.startsWith('__vue')          // Vue 2
    )) return true;
    node = node.parentElement;
  }
  return false;
}

// WeakSet of elements where span injection is safe (not framework-managed).
const injectSafeElements = new WeakSet();

// ── CSS Highlight API (framework-managed editors) ─────────────────────────────
// Highlights words without touching the DOM — no caret disruption, no
// framework reconciliation conflicts. Supported in Chrome 105+.

const frameworkRoots = new Set();
let cssHighlightTimer = null;

function rebuildCSSHighlights() {
  if (!CSS.highlights) return;
  const ranges = [];
  for (const root of frameworkRoots) {
    if (!root.isConnected) { frameworkRoots.delete(root); continue; }
    if (!isEnabled) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el && el !== root) {
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent;
      const wordRe = /\p{L}+/gu;
      let match;
      while ((match = wordRe.exec(text)) !== null) {
        if (lookupWord(match[0])) {
          const range = new Range();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          ranges.push(range);
        }
      }
    }
  }
  if (ranges.length > 0) {
    CSS.highlights.set('pasquali-correction', new Highlight(...ranges));
  } else {
    CSS.highlights.delete('pasquali-correction');
  }
}

function debouncedCSSHighlight(delay = 900) {
  clearTimeout(cssHighlightTimer);
  cssHighlightTimer = setTimeout(rebuildCSSHighlights, delay);
}

function setupFrameworkElement(el) {
  if (frameworkRoots.has(el)) return;
  frameworkRoots.add(el);
  if (!CSS.highlights) return;
  el.addEventListener('input', () => debouncedCSSHighlight());
  el.addEventListener('focus', () => debouncedCSSHighlight(300));
}

// ── Cursor save / restore ────────────────────────────────────────────────────

function saveCaret(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const toStart = document.createRange();
  toStart.selectNodeContents(root);
  toStart.setEnd(range.startContainer, range.startOffset);
  const start = toStart.toString().length;

  const toEnd = document.createRange();
  toEnd.selectNodeContents(root);
  toEnd.setEnd(range.endContainer, range.endOffset);
  return { start, end: toEnd.toString().length };
}

function restoreCaret(root, saved) {
  if (!saved) return;
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let chars = 0, startNode, startOff, endNode, endOff, node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startNode && chars + len >= saved.start) { startNode = node; startOff = saved.start - chars; }
    if (!endNode   && chars + len >= saved.end)   { endNode   = node; endOff   = saved.end   - chars; }
    if (startNode && endNode) break;
    chars += len;
  }
  if (!startNode) return;
  try {
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode ?? startNode, endNode ? endOff : startOff);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
}

// ── Context menu ─────────────────────────────────────────────────────────────

let menuCallbacks = { onApply: null, onIgnore: null };

function getOrCreateMenu() {
  let menu = document.getElementById('pasquali-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'pasquali-menu';

    // Prevent stealing focus from the active contenteditable.
    menu.addEventListener('mousedown', e => e.preventDefault());

    menu.addEventListener('click', e => {
      const item = e.target.closest('.pasquali-menu-item');
      if (!item) return;
      e.stopPropagation();
      // Capture before hideMenu() clears the callbacks.
      const applyFn  = menuCallbacks.onApply;
      const ignoreFn = menuCallbacks.onIgnore;
      hideMenu();
      if (item.classList.contains('apply')  && applyFn)  applyFn();
      if (item.classList.contains('ignore') && ignoreFn) ignoreFn();
    });

    document.documentElement.appendChild(menu);
  }
  return menu;
}

function showMenu(x, y, originalWord, correction, onApply, onIgnore) {
  const menu = getOrCreateMenu();
  menuCallbacks = { onApply, onIgnore };
  menu.innerHTML = `
    <div class="pasquali-menu-header">
      <div class="pasquali-menu-logo">P´</div>
      Pasquali
    </div>
    <div class="pasquali-menu-item apply">
      <span class="pasquali-menu-word-from">${escapeHtml(originalWord)}</span>
      <span class="pasquali-menu-arrow">→</span>
      <span class="pasquali-menu-word-to">${escapeHtml(correction)}</span>
    </div>
    <div class="pasquali-menu-item ignore">Ignorar</div>
  `;
  menu.style.display = 'block';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right  > window.innerWidth  - 8) menu.style.left = (x - r.width)  + 'px';
    if (r.bottom > window.innerHeight - 8) menu.style.top  = (y - r.height) + 'px';
  });
}

function hideMenu() {
  const menu = document.getElementById('pasquali-menu');
  if (menu) menu.style.display = 'none';
  menuCallbacks = { onApply: null, onIgnore: null };
}

function isMenuOpen() {
  const m = document.getElementById('pasquali-menu');
  return m ? m.style.display !== 'none' : false;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Word at cursor (contenteditable, no span required) ───────────────────────

function getWordAtCursorCE(root) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;

  const text = textNode.textContent;
  const pos  = range.startOffset;
  const wordRe = /\p{L}/u;

  let start = pos, end = pos;
  while (start > 0 && wordRe.test(text[start - 1])) start--;
  while (end < text.length && wordRe.test(text[end])) end++;

  if (start === end) return null;
  return { word: text.slice(start, end), textNode, start, end };
}

// Apply correction in contenteditable via Selection + execCommand.
// execCommand fires the proper beforeinput/input events that React/Vue handle.
function applyCECorrection(textNode, start, end, correction) {
  const sel = window.getSelection();
  if (!sel) return;
  try {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    sel.removeAllRanges();
    sel.addRange(range);
    // execCommand is deprecated but remains the only cross-framework way to
    // trigger a text replacement that React's synthetic event system accepts.
    document.execCommand('insertText', false, correction);
  } catch (_) {}
}

// ── Span-based contenteditable scanning (non-framework elements) ─────────────

let isModifying = false;

function clearHighlights(root) {
  isModifying = true;
  root.querySelectorAll('.pasquali-highlight').forEach(span => {
    span.replaceWith(document.createTextNode(span.textContent));
  });
  root.normalize();
  isModifying = false;
}

function processTextNode(textNode) {
  const text = textNode.textContent;
  if (!text.trim()) return false;

  const wordRe = /\p{L}+/gu;
  let match, lastIndex = 0;
  const segments = [];
  let hasMatch = false;

  while ((match = wordRe.exec(text)) !== null) {
    const word = match[0];
    const correction = lookupWord(word);
    if (correction) {
      if (match.index > lastIndex) segments.push({ type: 't', v: text.slice(lastIndex, match.index) });
      segments.push({ type: 'h', v: word, correction });
      lastIndex = match.index + word.length;
      hasMatch = true;
    }
  }

  if (!hasMatch) return false;
  if (lastIndex < text.length) segments.push({ type: 't', v: text.slice(lastIndex) });

  const frag = document.createDocumentFragment();
  for (const seg of segments) {
    if (seg.type === 't') {
      frag.appendChild(document.createTextNode(seg.v));
    } else {
      const span = document.createElement('span');
      span.className = 'pasquali-highlight';
      span.dataset.correction = seg.correction;
      span.textContent = seg.v;
      frag.appendChild(span);
    }
  }
  isModifying = true;
  textNode.parentNode.replaceChild(frag, textNode);
  isModifying = false;
  return true;
}

function hasCorrectableContent(root) {
  const wordRe = /\p{L}+/gu;
  let match;
  while ((match = wordRe.exec(root.textContent)) !== null) {
    if (lookupWord(match[0])) return true;
  }
  return false;
}

function scanContentEditable(root) {
  if (!isEnabled || !root.isConnected) return;
  if (isMenuOpen()) return;
  if (!injectSafeElements.has(root)) return;

  // Lazy re-check: fiber keys and block children are attached after the element
  // first appears, so setupElement() may have got it wrong. Never touch the DOM
  // here — calling clearHighlights() / normalize() on a live framework editor
  // triggers its reconciliation and corrupts the selection.
  if (isFrameworkManaged(root)) {
    injectSafeElements.delete(root);
    setupFrameworkElement(root);  // migrate to CSS highlight path
    debouncedCSSHighlight(100);
    return;
  }

  const hasHighlights = !!root.querySelector('.pasquali-highlight');
  if (!hasHighlights && !hasCorrectableContent(root)) return;

  const caret = saveCaret(root);
  clearHighlights(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let el = node.parentElement;
      while (el && el !== root) {
        if (SKIP_TAGS.has(el.tagName) ||
            el.classList.contains('pasquali-highlight') ||
            el.id === 'pasquali-menu') return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(processTextNode);

  restoreCaret(root, caret);
}

// ── textarea / input ──────────────────────────────────────────────────────────

function getWordAtCursorTA(element) {
  const pos  = element.selectionStart ?? 0;
  const text = element.value;
  const wordRe = /\p{L}/u;
  let start = pos, end = pos;
  while (start > 0 && wordRe.test(text[start - 1])) start--;
  while (end < text.length && wordRe.test(text[end])) end++;
  if (start === end) return null;
  return { word: text.slice(start, end), start, end };
}

function applyTACorrection(element, correction, start, end) {
  element.value = element.value.slice(0, start) + correction + element.value.slice(end);
  element.selectionStart = element.selectionEnd = start + correction.length;
  element.dispatchEvent(new Event('input',  { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── Debounced scan ────────────────────────────────────────────────────────────

const debounceMap = new WeakMap();

function debouncedScan(element, delay = 900) {
  if (debounceMap.has(element)) clearTimeout(debounceMap.get(element));
  const tid = setTimeout(() => {
    debounceMap.delete(element);
    if (element.isContentEditable) scanContentEditable(element);
  }, delay);
  debounceMap.set(element, tid);
}

// ── Per-element setup ─────────────────────────────────────────────────────────

const setupElements = new WeakSet();

function setupElement(el) {
  if (setupElements.has(el)) return;
  setupElements.add(el);

  if (el.isContentEditable) {
    if (!isFrameworkManaged(el)) {
      injectSafeElements.add(el);
      el.addEventListener('input', () => { if (!isModifying) debouncedScan(el); });
      el.addEventListener('focus', () => { if (!isModifying) debouncedScan(el, 300); });
      el.addEventListener('blur',  () => { if (!isMenuOpen()) scanContentEditable(el); });
    } else {
      // Framework-managed: CSS Highlight API for visuals, right-click for corrections.
      setupFrameworkElement(el);
    }
  }
}

function isContentEditableRoot(el) {
  const ce = el.getAttribute?.('contenteditable');
  return ce === 'true' || ce === '';
}

function getEditableElements(root = document) {
  const results = [];
  root.querySelectorAll?.('[contenteditable="true"], [contenteditable=""]').forEach(el => results.push(el));
  root.querySelectorAll?.('textarea, input[type="text"], input[type="search"], input[type="email"], input:not([type])').forEach(el => {
    if (!el.readOnly && !el.disabled) results.push(el);
  });
  return results;
}

// ── Global event listeners ────────────────────────────────────────────────────

document.addEventListener('contextmenu', e => {
  if (!isEnabled) return;

  // 1. Right-click on a span we injected.
  const span = e.target.closest?.('.pasquali-highlight');
  if (span) {
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, span.textContent, span.dataset.correction,
      () => {
        if (!span.isConnected) return;
        isModifying = true;
        span.replaceWith(document.createTextNode(span.dataset.correction));
        isModifying = false;
      },
      () => {
        if (!span.isConnected) return;
        isModifying = true;
        span.replaceWith(document.createTextNode(span.textContent));
        isModifying = false;
      }
    );
    return;
  }

  // 2. Right-click inside a contenteditable (framework-managed or un-scanned).
  //    Falls back to cursor-position lookup — no span required.
  const ce = e.target.closest?.('[contenteditable="true"], [contenteditable=""]');
  if (ce) {
    const result = getWordAtCursorCE(ce);
    if (!result) return;
    const correction = lookupWord(result.word);
    if (!correction) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, result.word, correction,
      () => applyCECorrection(result.textNode, result.start, result.end, correction),
      () => {}
    );
    return;
  }

  // 3. Right-click inside textarea / input.
  const field = e.target.closest?.('textarea, input[type="text"], input[type="search"], input[type="email"], input:not([type])');
  if (field) {
    const result = getWordAtCursorTA(field);
    if (!result) return;
    const correction = lookupWord(result.word);
    if (!correction) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, result.word, correction,
      () => applyTACorrection(field, correction, result.start, result.end),
      () => {}
    );
  }
}, true);

// Close when clicking outside — bubbling so the menu's own click fires first.
document.addEventListener('click', e => {
  if (isMenuOpen() && !e.target.closest('#pasquali-menu')) hideMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideMenu();
}, true);

// ── MutationObserver ──────────────────────────────────────────────────────────

const docObserver = new MutationObserver(mutations => {
  if (isModifying) return;
  for (const mut of mutations) {
    // Handle elements that gain the contenteditable attribute dynamically.
    if (mut.type === 'attributes' && mut.attributeName === 'contenteditable') {
      if (isContentEditableRoot(mut.target)) {
        setupElement(mut.target);
        if (injectSafeElements.has(mut.target) && mut.target.textContent.trim()) {
          scanContentEditable(mut.target);
        }
      }
      continue;
    }
    // Handle newly added nodes.
    for (const node of mut.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      // Check the node itself.
      if (isContentEditableRoot(node)) {
        setupElement(node);
        if (injectSafeElements.has(node) && node.textContent.trim()) scanContentEditable(node);
      }
      // Check descendants.
      getEditableElements(node).forEach(el => {
        setupElement(el);
        if (injectSafeElements.has(el) && el.textContent.trim()) scanContentEditable(el);
      });
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

function applySettings(settings) {
  isEnabled = settings.enabled ?? true;
  activeLanguages = settings.languages ?? ['pt_BR', 'de_DE'];
  buildDictionary();
  if (!isEnabled) {
    document.querySelectorAll('[contenteditable]').forEach(clearHighlights);
    if (CSS.highlights) CSS.highlights.delete('pasquali-correction');
  } else {
    rebuildCSSHighlights();
  }
}

chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, settings => {
  if (chrome.runtime.lastError) return;
  applySettings(settings ?? { enabled: true, languages: ['pt_BR', 'de_DE'] });

  getEditableElements().forEach(el => {
    setupElement(el);
    if (injectSafeElements.has(el) && el.textContent.trim()) scanContentEditable(el);
  });

  docObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['contenteditable'],
  });
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'SETTINGS_CHANGED') {
    applySettings(msg.settings);
    if (isEnabled) getEditableElements().forEach(el => {
      if (injectSafeElements.has(el)) scanContentEditable(el);
    });
  }
});
