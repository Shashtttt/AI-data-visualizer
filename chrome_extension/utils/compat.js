/**
 * utils/compat.js
 * Universal Cross-Browser Compatibility Layer (Manifest V3)
 * Supports: Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, Opera
 * 
 * Provides unified Promise & Callback abstractions across browser.* and chrome.* APIs.
 */

(() => {
  // Ensure globalThis.browser and globalThis.chrome exist and mirror each other
  if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
    globalThis.browser = globalThis.chrome;
  } else if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
    globalThis.chrome = globalThis.browser;
  }

  const hasBrowser = typeof globalThis.browser !== 'undefined';
  const hasChrome = typeof globalThis.chrome !== 'undefined';

  const WebExtCompat = {
    // Detect host browser
    isFirefox: typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent),
    isEdge: typeof navigator !== 'undefined' && /edg\//i.test(navigator.userAgent),
    isChrome: typeof navigator !== 'undefined' && /chrome/i.test(navigator.userAgent) && !/edg\//i.test(navigator.userAgent),

    // Unified API root
    get api() {
      if (hasBrowser && globalThis.browser.runtime) return globalThis.browser;
      if (hasChrome && globalThis.chrome.runtime) return globalThis.chrome;
      return null;
    },

    // 1. Storage API (Purely local browser storage - NEVER synced to cloud servers)
    storage: {
      async get(keys) {
        const ext = WebExtCompat.api;
        if (!ext || !ext.storage || !ext.storage.local) {
          // Fallback to window.localStorage
          const result = {};
          const keyArr = Array.isArray(keys) ? keys : [keys];
          keyArr.forEach(k => {
            try {
              const val = localStorage.getItem(k);
              if (val !== null) {
                try { result[k] = JSON.parse(val); } catch (_) { result[k] = val; }
              }
            } catch (_) {}
          });
          return result;
        }

        // Try Promise first (Firefox / modern Chrome)
        try {
          const res = ext.storage.local.get(keys);
          if (res && typeof res.then === 'function') {
            return await res;
          }
        } catch (_) {}

        // Callback fallback
        return new Promise(resolve => {
          try {
            ext.storage.local.get(keys, result => resolve(result || {}));
          } catch (_) {
            resolve({});
          }
        });
      },

      async set(items) {
        const ext = WebExtCompat.api;
        if (!ext || !ext.storage || !ext.storage.local) {
          Object.entries(items).forEach(([k, v]) => {
            try {
              localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
            } catch (_) {}
          });
          return true;
        }

        try {
          const res = ext.storage.local.set(items);
          if (res && typeof res.then === 'function') {
            return await res;
          }
        } catch (_) {}

        return new Promise(resolve => {
          try {
            ext.storage.local.set(items, () => resolve(true));
          } catch (_) {
            resolve(false);
          }
        });
      },

      async remove(keys) {
        const ext = WebExtCompat.api;
        if (!ext || !ext.storage || !ext.storage.local) {
          const keyArr = Array.isArray(keys) ? keys : [keys];
          keyArr.forEach(k => {
            try { localStorage.removeItem(k); } catch (_) {}
          });
          return true;
        }

        try {
          const res = ext.storage.local.remove(keys);
          if (res && typeof res.then === 'function') {
            return await res;
          }
        } catch (_) {}

        return new Promise(resolve => {
          try {
            ext.storage.local.remove(keys, () => resolve(true));
          } catch (_) {
            resolve(false);
          }
        });
      }
    },

    // 2. Tabs API
    tabs: {
      async query(queryInfo) {
        const ext = WebExtCompat.api;
        if (!ext || !ext.tabs || !ext.tabs.query) return [];

        try {
          const res = ext.tabs.query(queryInfo);
          if (res && typeof res.then === 'function') {
            return await res;
          }
        } catch (_) {}

        return new Promise(resolve => {
          try {
            ext.tabs.query(queryInfo, tabs => resolve(tabs || []));
          } catch (_) {
            resolve([]);
          }
        });
      },

      async getActiveTab() {
        const tabs = await WebExtCompat.tabs.query({ active: true, currentWindow: true });
        return tabs && tabs.length ? tabs[0] : null;
      },

      async create(createProperties) {
        const ext = WebExtCompat.api;
        if (!ext || !ext.tabs || !ext.tabs.create) return null;

        try {
          const res = ext.tabs.create(createProperties);
          if (res && typeof res.then === 'function') {
            return await res;
          }
        } catch (_) {}

        return new Promise(resolve => {
          try {
            ext.tabs.create(createProperties, tab => resolve(tab || null));
          } catch (_) {
            resolve(null);
          }
        });
      },

      sendMessage(tabId, message, callback) {
        const ext = WebExtCompat.api;
        if (!ext || !ext.tabs || !ext.tabs.sendMessage) {
          if (callback) callback(null, new Error('tabs.sendMessage not available'));
          return;
        }

        try {
          const p = ext.tabs.sendMessage(tabId, message);
          if (p && typeof p.then === 'function') {
            p.then(resp => {
              if (callback) callback(resp, null);
            }).catch(err => {
              if (callback) callback(null, err);
            });
            return;
          }
        } catch (_) {}

        try {
          ext.tabs.sendMessage(tabId, message, resp => {
            const err = ext.runtime?.lastError;
            if (callback) callback(resp, err || null);
          });
        } catch (err) {
          if (callback) callback(null, err);
        }
      }
    },

    // 3. Runtime API
    runtime: {
      getURL(path) {
        const ext = WebExtCompat.api;
        if (ext && ext.runtime && ext.runtime.getURL) {
          return ext.runtime.getURL(path);
        }
        return path;
      },

      sendMessage(message, callback) {
        const ext = WebExtCompat.api;
        if (!ext || !ext.runtime || !ext.runtime.sendMessage) {
          if (callback) callback(null, new Error('runtime.sendMessage not available'));
          return;
        }

        try {
          const p = ext.runtime.sendMessage(message);
          if (p && typeof p.then === 'function') {
            p.then(resp => {
              if (callback) callback(resp, null);
            }).catch(err => {
              if (callback) callback(null, err);
            });
            return;
          }
        } catch (_) {}

        try {
          ext.runtime.sendMessage(message, resp => {
            const err = ext.runtime?.lastError;
            if (callback) callback(resp, err || null);
          });
        } catch (err) {
          if (callback) callback(null, err);
        }
      }
    },

    // 4. Scripting API (Dynamic script injection)
    scripting: {
      async executeScript(injection) {
        const ext = WebExtCompat.api;
        if (ext && ext.scripting && ext.scripting.executeScript) {
          try {
            const p = ext.scripting.executeScript(injection);
            if (p && typeof p.then === 'function') {
              return await p;
            }
            return true;
          } catch (e) {
            console.warn('[WebExtCompat] executeScript error:', e);
            throw e;
          }
        }
        throw new Error('scripting.executeScript not supported in this context');
      }
    },

    // Check if URL is a browser restricted internal page
    isRestrictedUrl(url) {
      if (!url || typeof url !== 'string') return false;
      const restrictedPrefixes = [
        'chrome://',
        'chrome-extension://',
        'edge://',
        'about:',
        'moz-extension://',
        'chrome-search://',
        'view-source:',
        'data:',
        'javascript:'
      ];
      return restrictedPrefixes.some(prefix => url.startsWith(prefix));
    }
  };

  // Expose globally
  globalThis.WebExtCompat = WebExtCompat;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebExtCompat;
  }
})();
