/**
 * background/service-worker.js
 * AI Data Cleaner - Universal Background Controller (Manifest V3)
 * Compatible with: Google Chrome (Service Worker), Microsoft Edge, Mozilla Firefox (Event Scripts)
 * Manages runtime communications, dataset state caching, and full studio tab launching.
 */

// Cross-browser extension API resolver
const extApi = (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime)
  ? globalThis.browser
  : (typeof globalThis.chrome !== 'undefined' ? globalThis.chrome : null);

// Listen for installation
if (extApi && extApi.runtime && extApi.runtime.onInstalled) {
  extApi.runtime.onInstalled.addListener(() => {
    console.log('[AI Data Cleaner] Extension installed and ready on', navigator.userAgent);
    // Initialize default configuration in local browser storage only
    extApi.storage.local.get(['geminiApiKey', 'geminiModel', 'aiEnabled'], (res) => {
      if (!res || res.aiEnabled === undefined) {
        extApi.storage.local.set({
          aiEnabled: true,
          geminiModel: 'gemini-1.5-flash'
        });
      }
    });
  });
}

// Note: default_popup is configured in manifest.json for consistent popup window behavior

// Message listener for tab coordination
if (extApi && extApi.runtime && extApi.runtime.onMessage) {
  extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'OPEN_SIDE_PANEL' || message.action === 'OPEN_STUDIO') {
      const tabId = (sender && sender.tab && sender.tab.id) || message.tabId;
      if (extApi.sidePanel && typeof extApi.sidePanel.open === 'function' && tabId) {
        extApi.sidePanel.open({ tabId }).then(() => {
          sendResponse({ success: true, mode: 'side_panel' });
        }).catch(() => {
          extApi.tabs.create({ url: extApi.runtime.getURL('popup/popup.html') });
          sendResponse({ success: true, mode: 'tab' });
        });
        return true;
      } else {
        extApi.tabs.create({ url: extApi.runtime.getURL('popup/popup.html') });
        sendResponse({ success: true, mode: 'tab' });
        return true;
      }
    }

    if (message.action === 'SET_ACTIVE_DATASET') {
      extApi.storage.local.set({ currentDataset: message.dataset }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.action === 'GET_ACTIVE_DATASET') {
      extApi.storage.local.get(['currentDataset'], (res) => {
        sendResponse({ dataset: (res && res.currentDataset) || null });
      });
      return true;
    }

    // Cross-origin data fetcher (e.g. Google Sheets CSV export)
    if (message.action === 'FETCH_URL_DATA') {
      fetch(message.url, { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) {
            sendResponse({ success: false, status: response.status, error: `HTTP ${response.status}: ${response.statusText}` });
            return;
          }
          const text = await response.text();
          sendResponse({ success: true, text });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
      return true; // asynchronous response
    }
  });
}
