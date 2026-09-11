const $ = id => document.getElementById(id);

async function loadSettings() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
  });
}

async function saveSettings(settings) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', settings }, resolve);
  });
}

async function notifyTabs(settings) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_CHANGED', settings }).catch(() => {});
  }
}

async function init() {
  const settings = await loadSettings();
  const enabled = settings?.enabled ?? true;
  const languages = settings?.languages ?? ['pt_BR', 'de_DE'];

  $('enabled').checked = enabled;
  $('pt_BR').checked = languages.includes('pt_BR');
  $('de_DE').checked = languages.includes('de_DE');

  applyDisabledState(enabled);
  updateStatus(enabled, languages);

  $('enabled').addEventListener('change', async () => {
    const newEnabled = $('enabled').checked;
    const langs = getActiveLangs();
    const s = { enabled: newEnabled, languages: langs };
    applyDisabledState(newEnabled);
    updateStatus(newEnabled, langs);
    await saveSettings(s);
    notifyTabs(s);
  });

  ['pt_BR', 'de_DE'].forEach(id => {
    $(id).addEventListener('change', async () => {
      const langs = getActiveLangs();
      const s = { enabled: $('enabled').checked, languages: langs };
      updateStatus(s.enabled, langs);
      await saveSettings(s);
      notifyTabs(s);
    });
  });
}

function getActiveLangs() {
  return ['pt_BR', 'de_DE'].filter(id => $(id).checked);
}

function applyDisabledState(enabled) {
  document.querySelector('.popup').classList.toggle('disabled', !enabled);
}

function updateStatus(enabled, languages) {
  const msg = $('status-msg');
  if (!enabled) { msg.textContent = 'Plugin desativado'; return; }
  if (languages.length === 0) { msg.textContent = 'Nenhum idioma selecionado'; return; }
  const names = { pt_BR: 'PT-BR', de_DE: 'DE' };
  msg.textContent = 'Ativo: ' + languages.map(l => names[l]).join(', ');
}

init();
