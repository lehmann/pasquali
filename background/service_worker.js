chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ enabled: true, languages: ['pt_BR', 'de_DE'] });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['enabled', 'languages'], sendResponse);
    return true;
  }
  if (message.type === 'SET_SETTINGS') {
    chrome.storage.sync.set(message.settings, () => sendResponse({ ok: true }));
    return true;
  }
});
