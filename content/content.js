/* global PASQUALI_PT_BR, PASQUALI_DE_DE */

// ── State ────────────────────────────────────────────────────────────────────

let isEnabled = true;
let activeLanguages = ['pt_BR', 'de_DE'];
let dictionary = {};

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'MATH', 'SVG',
  'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT']);

// ── Dictionary ────────────────────────────────────────────────────────────────

function buildDictionary() {
  dictionary = {};
  if (activeLanguages.includes('pt_BR')) Object.assign(dictionary, PASQUALI_PT_BR);
  if (activeLanguages.includes('de_DE')) Object.assign(dictionary, PASQUALI_DE_DE);
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
  return Object.keys(el).some(k =>
    k.startsWith('__reactFiber$') ||
    k.startsWith('__reactProps$') ||
    k.startsWith('__reactEvents$') ||
    k.startsWith('_vei') ||          // Vue 3
    k.startsWith('__vue')            // Vue 2
  );
}

// WeakSet of elements where span injection is safe (not framework-managed).
const injectSafeElements = new WeakSet();

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

function scanContentEditable(root) {
  if (!isEnabled || !root.isConnected) return;
  if (isMenuOpen()) return;
  if (!injectSafeElements.has(root)) return; // framework-managed: skip injection

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
    // Determine if span injection is safe (element not managed by a framework).
    if (!isFrameworkManaged(el)) {
      injectSafeElements.add(el);
      el.addEventListener('input', () => { if (!isModifying) debouncedScan(el); });
      el.addEventListener('focus', () => { if (!isModifying) debouncedScan(el, 300); });
      el.addEventListener('blur',  () => { if (!isMenuOpen()) scanContentEditable(el); });
    }
    // Framework-managed elements (React/Vue): right-click still works via
    // getWordAtCursorCE() + applyCECorrection(), no span injection needed.
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
  if (!isEnabled) document.querySelectorAll('[contenteditable]').forEach(clearHighlights);
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
