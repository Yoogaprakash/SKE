(function () {
  // Lightweight central store helper using Firebase Realtime Database (compat build)
  // This script is optional. Enable by setting `window.CENTRAL_STORE_ENABLED = true`
  // and providing a valid `window.FIREBASE_CONFIG` object in `index.html`.
  // NOTE: For quick testing you can set Realtime Database rules to allow public writes:
  // {
  //   "rules": {
  //     ".read": true,
  //     ".write": true
  //   }
  // }

  if (typeof window === 'undefined') return;

  const CENTRAL_ROOT = '/central';

  function safeLog(...args) {
    if (window.console && console.log) console.log('[CentralStore]', ...args);
  }

  const CentralStore = {
    db: null,
    initialized: false,

    init(config) {
      try {
        if (!config || !config.apiKey) {
          safeLog('Firebase config not provided — central store disabled.');
          return false;
        }
        if (!window.firebase || !firebase.initializeApp) {
          safeLog('Firebase SDK not loaded.');
          return false;
        }
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
        this.db = firebase.database();
        this.initialized = true;
        safeLog('initialized');
        return true;
      } catch (err) {
        console.error('Failed to init Firebase', err);
        return false;
      }
    },

    async fetchAndSync() {
      if (!this.initialized) return;
      try {
        const rootRef = this.db.ref(CENTRAL_ROOT + '/data');
        const snapshot = await rootRef.once('value');
        const data = snapshot.val();
        if (!data) {
          safeLog('No central data found.');
          // nothing to sync but still notify
          window.dispatchEvent(new Event('central-data-synced'));
          this.listenForSales();
          return;
        }

        // Write keys to localStorage to keep compatibility with existing app
        if (data.categories) {
          localStorage.setItem('bb_electrical_categories', JSON.stringify(data.categories));
        }
        if (data.items) {
          localStorage.setItem('bb_electrical_items', JSON.stringify(data.items));
        }
        if (data.settings) {
          localStorage.setItem('bb_electrical_settings', JSON.stringify(data.settings));
        }
        if (data.sales) {
          localStorage.setItem('bb_electrical_sales', JSON.stringify(data.sales));
        }

        safeLog('Synced central data to localStorage');
        window.dispatchEvent(new Event('central-data-synced'));
        this.listenForSales();
      } catch (err) {
        console.error('Failed to fetch central data', err);
        window.dispatchEvent(new Event('central-data-sync-failed'));
      }
    },

    listenForSales() {
      if (!this.initialized) return;
      try {
        const salesRef = this.db.ref(CENTRAL_ROOT + '/sales');
        // Listen for new sales and merge into localStorage
        salesRef.on('child_added', (snap) => {
          try {
            const newSale = snap.val();
            if (!newSale || !newSale.id) return;
            const localSales = JSON.parse(localStorage.getItem('bb_electrical_sales') || '[]');
            const exists = localSales.some((s) => s.id === newSale.id);
            if (!exists) {
              localSales.push(newSale);
              localStorage.setItem('bb_electrical_sales', JSON.stringify(localSales));
              safeLog('New sale merged from central', newSale.id);
              window.dispatchEvent(new CustomEvent('central-sale-added', { detail: newSale }));
            }
          } catch (err) {
            console.error('Error processing central sale child_added', err);
          }
        });

        // Optionally listen for full data changes
        const dataRef = this.db.ref(CENTRAL_ROOT + '/data');
        dataRef.on('value', (snap) => {
          const updated = snap.val();
          if (!updated) return;
          if (updated.categories) localStorage.setItem('bb_electrical_categories', JSON.stringify(updated.categories));
          if (updated.items) localStorage.setItem('bb_electrical_items', JSON.stringify(updated.items));
          if (updated.settings) localStorage.setItem('bb_electrical_settings', JSON.stringify(updated.settings));
          if (updated.sales) localStorage.setItem('bb_electrical_sales', JSON.stringify(updated.sales));
          safeLog('Central data updated and merged to localStorage');
          window.dispatchEvent(new Event('central-data-updated'));
        });
      } catch (err) {
        console.error('Failed to listen for central sales', err);
      }
    },

    async pushSale(saleRecord) {
      if (!this.initialized) return false;
      try {
        // Push to sales node
        const salesRef = this.db.ref(CENTRAL_ROOT + '/sales');
        await salesRef.push(saleRecord);
        safeLog('Pushed sale to central');

        // Also update the full data snapshot for categories/items/settings if desired
        // This helps keep a canonical data file at /central/data
        try {
          const dataRef = this.db.ref(CENTRAL_ROOT + '/data');
          // read current data
          const currentSnap = await dataRef.once('value');
          const current = currentSnap.val() || {};
          // Merge with localStorage canonical keys
          const categories = JSON.parse(localStorage.getItem('bb_electrical_categories') || '[]');
          const items = JSON.parse(localStorage.getItem('bb_electrical_items') || '[]');
          const settings = JSON.parse(localStorage.getItem('bb_electrical_settings') || '{}');
          const sales = JSON.parse(localStorage.getItem('bb_electrical_sales') || '[]');
          const merged = Object.assign({}, current, { categories, items, settings, sales });
          await dataRef.set(merged);
          safeLog('Updated central /data snapshot');
        } catch (err) {
          console.warn('Failed to update central data snapshot (non-fatal)', err);
        }

        return true;
      } catch (err) {
        console.error('Failed to push sale to central', err);
        return false;
      }
    },
    updateSnapshot(debounceMs = 800) {
      if (!this.initialized) return false;
      try {
        if (this._snapshotTimer) {
          clearTimeout(this._snapshotTimer);
        }
        this._snapshotTimer = setTimeout(async () => {
          try {
            const dataRef = this.db.ref(CENTRAL_ROOT + '/data');
            const categories = JSON.parse(localStorage.getItem('bb_electrical_categories') || '[]');
            const items = JSON.parse(localStorage.getItem('bb_electrical_items') || '[]');
            const settings = JSON.parse(localStorage.getItem('bb_electrical_settings') || '{}');
            const sales = JSON.parse(localStorage.getItem('bb_electrical_sales') || '[]');
            const merged = { categories, items, settings, sales };
            await dataRef.set(merged);
            safeLog('Central /data snapshot updated (debounced)');
            // Emit event when snapshot update completes
            window.dispatchEvent(new Event('central-snapshot-updated'));
          } catch (err) {
            console.warn('Failed to update central snapshot', err);
            // Emit failure event so loader can be cleared
            window.dispatchEvent(new Event('central-snapshot-update-failed'));
          }
        }, debounceMs);
        return true;
      } catch (err) {
        console.warn('updateSnapshot error', err);
        return false;
      }
    },

    async clearSales() {
      if (!this.initialized) return false;
      try {
        // Clear sales node
        await this.db.ref(CENTRAL_ROOT + '/sales').remove();
        // Clear sales from data snapshot
        await this.db.ref(CENTRAL_ROOT + '/data/sales').set([]);
        safeLog('Cleared central sales data');
        return true;
      } catch (err) {
        console.error('Failed to clear central sales', err);
        return false;
      }
    },
  };

  window.CentralStore = CentralStore;
})();
