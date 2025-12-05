(() => {
  const STORAGE_KEYS = {
    categories: 'bb_electrical_categories',
    items: 'bb_electrical_items',
    sales: 'bb_electrical_sales',
    settings: 'bb_electrical_settings',
    session: 'bb_electrical_session',
  };

  (() => {
    // Import shared invoice utilities
    const {
      sanitizeFilename,
      generateBillNumber,
      sanitizeGstRate,
      roundCurrency,
      formatCurrency,
      escapeHtml = (s) => s ?? '',
      formatGstRateLabel,
      buildInvoiceLineItem,
      calculateTotalsFromLineItems,
      buildInvoiceModel,
      buildInvoiceFragments,
      renderInvoiceHtml,
      printInvoice,
    } = window.InvoiceUtils;

    const STORAGE_KEYS = {
      categories: 'bb_electrical_categories',
      items: 'bb_electrical_items',
      sales: 'bb_electrical_sales',
      settings: 'bb_electrical_settings',
      session: 'bb_electrical_session',
    };

    const ROLE_CREDENTIALS = {
      admin: {
        username: 'admin',
        password: 'admin@123',
        label: 'Admin',
      },
      sales: {
        username: 'sales',
        password: 'sales@123',
        label: 'Sales',
      },
    };

    const defaultData = {
      categories: [
        {
          id: crypto.randomUUID(),
          name: 'Category 1',
          description: 'Description for Category 1',
        },
        {
          id: crypto.randomUUID(),
          name: 'Category 2',
          description: 'Description for Category 2',
        },
      ],
    };

    const defaultItems = (categories) => [
      {
        id: crypto.randomUUID(),
        categoryId: categories[0].id,
        name: 'Item 1',
        brand: 'Brand A',
        price: 100,
        gstRate: 12,
        stock: 50,
        image: 'assets/img/placeholder.svg',
        description: 'Description for Item 1',
      },
      {
        id: crypto.randomUUID(),
        categoryId: categories[0].id,
        name: 'Item 2',
        brand: 'Brand B',
        price: 200,
        gstRate: 18,
        stock: 30,
        image: 'assets/img/placeholder.svg',
        description: 'Description for Item 2',
      },
      {
        id: crypto.randomUUID(),
        categoryId: categories[1].id,
        name: 'Item 3',
        brand: 'Brand C',
        price: 1500,
        gstRate: 18,
        stock: 10,
        image: 'assets/img/placeholder.svg',
        description: 'Description for Item 3',
      },
    ];

    const DEFAULT_SETTINGS = {
      shopName: 'Company',
      shopTagline: 'Shop',
      shopAddress: '',
      shopContact: 'Phone: +91-90000 00000',
      upiId: 'shop@upi',
      gstEnabled: true,
      gstNo: '',
      billSeries: 1,
    };

    function getStoredData(key, fallback) {
      try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : fallback;
      } catch (error) {
        console.error('Failed to parse storage', error);
        return fallback;
      }
    }

    function setStoredData(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
      try {
        if (
          window.CENTRAL_STORE_ENABLED &&
          window.CentralStore &&
          window.CentralStore.initialized &&
          typeof window.CentralStore.updateSnapshot === 'function'
        ) {
          // Show loader and schedule it to hide after timeout
          const loader = document.getElementById('globalLoader');
          if (loader) {
            loader.classList.add('show');
          }

          // Set a timeout to hide loader if central update doesn't complete
          let timeoutId = setTimeout(() => {
            if (loader) loader.classList.remove('show');
          }, 3000);

          // Listen for snapshot update completion and hide loader
          const onUpdateDone = () => {
            clearTimeout(timeoutId);
            if (loader) loader.classList.remove('show');
            document.removeEventListener('central-snapshot-updated', onUpdateDone);
            document.removeEventListener('central-snapshot-update-failed', onUpdateDone);
          };

          document.addEventListener('central-snapshot-updated', onUpdateDone, { once: true });
          document.addEventListener('central-snapshot-update-failed', onUpdateDone, { once: true });

          // Debounced snapshot update — non-blocking
          window.CentralStore.updateSnapshot();
        }
      } catch (err) {
        console.warn('Failed to update central snapshot', err);
      }
    }

    function normalizeItem(item) {
      const priceValue =
        typeof item.price === 'number'
          ? item.price
          : typeof item.price === 'string'
            ? parseFloat(item.price)
            : 0;
      return {
        gstRate: 0,
        brand: '',
        stock: null,
        ...item,
        price: Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : 0,
        gstRate: sanitizeGstRate(item.gstRate),
        brand: typeof item.brand === 'string' ? item.brand.trim() : '',
        stock: sanitizeStock(item.stock),
      };
    }

    const state = {
      categories: [],
      items: [],
      cart: [],
      selectedCategoryId: null,
      settings: { ...DEFAULT_SETTINGS },
      lastTotals: { subtotal: 0, tax: 0, total: 0 },
      activeRole: 'sales',
      customer: {
        name: '',
        phone: '',
      },
      isAuthenticated: false,
      sessionUserId: null,
    };

    let pendingItemImageData = null;

    // DOM references
    const navShopName = document.getElementById('navShopName');
    const navShopIcon = document.getElementById('navShopIcon');
    const categoryList = document.querySelector('#categoryList');
    const categoryTitle = document.querySelector('#categoryTitle');
    const productGrid = document.querySelector('#productGrid');
    const cartTableBody = document.querySelector('#cartTableBody');
    const cartCount = document.querySelector('#cartCount');
    const subtotalValue = document.querySelector('#subtotalValue');
    const taxValue = document.querySelector('#taxValue');
    const totalValue = document.querySelector('#totalValue');
    const payModalTotal = document.querySelector('#payModalTotal');
    const gstHeaderCell = document.getElementById('gstHeaderCell');
    const gstSummaryRow = document.getElementById('gstSummaryRow');

    const categoryModal = document.getElementById('categoryModal');
    const categoryForm = document.getElementById('categoryForm');
    const itemModal = document.getElementById('itemModal');
    const itemForm = document.getElementById('itemForm');
    const itemBrandInput = document.getElementById('itemBrand');
    const itemPriceInput = document.getElementById('itemPrice');
    const itemStockInput = document.getElementById('itemStock');
    const itemImageInput = document.getElementById('itemImage');
    const settingsForm = document.getElementById('settingsForm');
    const shopNameInput = document.getElementById('shopNameInput');
    const shopTaglineInput = document.getElementById('shopTaglineInput');
    const shopAddressInput = document.getElementById('shopAddressInput');
    const shopContactInput = document.getElementById('shopContactInput');
    const upiIdInput = document.getElementById('upiIdInput');
    const billSeriesInput = document.getElementById('billSeriesInput');
    const gstToggle = document.getElementById('gstToggle');
    const settingsQrPreview = document.getElementById('settingsQrPreview');
    const activeRoleLabel = document.getElementById('activeRoleLabel');
    const sessionStatusLabel = document.getElementById('sessionStatusLabel');
    const adminOnlyControls = document.querySelectorAll('.admin-only');
    const customerNameInput = document.getElementById('customerNameInput');
    const customerPhoneInput = document.getElementById('customerPhoneInput');
    const completeSaleBtn = document.getElementById('completeSaleBtn');
    const itemImageFileInput = document.getElementById('itemImageFile');
    const itemImagePreview = document.getElementById('itemImagePreview');
    const resetItemImageBtn = document.getElementById('resetItemImageBtn');
    const downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
    const exportItemsBtn = document.getElementById('exportItemsBtn');
    const importItemsBtn = document.getElementById('importItemsBtn');
    const itemImportInput = document.getElementById('itemImportInput');
    const companyNameEl = document.getElementById('companyName');
    const companyTaglineEl = document.getElementById('companyTagline');
    const companyAddressEl = document.getElementById('companyAddress');
    const companyContactEl = document.getElementById('companyContact');
    const openLoginModalBtn = document.getElementById('openLoginModalBtn');
    const gstNoInput = document.getElementById('gstNoInput');
    const addCustomItemBtn = document.getElementById('addCustomItemBtn');
    const customItemModal = document.getElementById('customItemModal');
    const customItemForm = document.getElementById('customItemForm');

    const settingsModalElement = document.getElementById('settingsModal');
    const payModalElement = document.getElementById('payModal');
    const loginModalElement = document.getElementById('loginModal');
    const payQrImage = document.getElementById('payQrImage');
    const payModalUpi = document.getElementById('payModalUpi');
    const payModalLink = document.getElementById('payModalLink');
    const loginForm = document.getElementById('loginForm');
    const loginUserIdInput = document.getElementById('loginUserId');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginErrorAlert = document.getElementById('loginErrorAlert');
    const logoutBtn = document.getElementById('logoutBtn');

    const payModalInstance = payModalElement
      ? bootstrap.Modal.getOrCreateInstance(payModalElement)
      : null;
    const settingsModalInstance = settingsModalElement
      ? bootstrap.Modal.getOrCreateInstance(settingsModalElement)
      : null;
    const loginModalInstance = loginModalElement
      ? bootstrap.Modal.getOrCreateInstance(loginModalElement)
      : null;

    function persistSession() {
      if (state.isAuthenticated) {
        setStoredData(STORAGE_KEYS.session, {
          activeRole: state.activeRole,
          userId: state.sessionUserId,
          authenticated: true,
        });
      } else {
        localStorage.removeItem(STORAGE_KEYS.session);
      }
    }

    function isAdmin() {
      return state.activeRole === 'admin';
    }

    function isGstEnabled() {
      return Boolean(state.settings?.gstEnabled);
    }

    function updateSessionUi() {
      const label = getRoleLabel(state.activeRole);
      const userSuffix =
        state.isAuthenticated && state.sessionUserId
          ? ` (${state.sessionUserId})`
          : '';
      if (activeRoleLabel) {
        activeRoleLabel.textContent = state.isAuthenticated
          ? `${label}${userSuffix}`
          : 'Guest';
      }
      if (sessionStatusLabel) {
        sessionStatusLabel.textContent = state.isAuthenticated
          ? 'Logged in as'
          : 'Please log in';
        sessionStatusLabel.classList.toggle('text-warning', !state.isAuthenticated);
      }
      if (openLoginModalBtn) {
        openLoginModalBtn.classList.toggle('d-none', state.isAuthenticated);
      }
      if (logoutBtn) {
        logoutBtn.classList.toggle('d-none', !state.isAuthenticated);
      }
    }

    function syncCustomerInputs() {
      if (customerNameInput) {
        customerNameInput.value = state.customer.name;
      }
      if (customerPhoneInput) {
        customerPhoneInput.value = state.customer.phone;
      }
    }

    function refreshCustomerStateFromInputs() {
      if (customerNameInput) {
        state.customer.name = customerNameInput.value.trim();
      }
      if (customerPhoneInput) {
        state.customer.phone = customerPhoneInput.value.trim();
      }
    }

    function getCustomerSnapshot() {
      const name = state.customer.name?.trim() ?? '';
      const phone = state.customer.phone?.trim() ?? '';
      return {
        name: name || 'Walk-in Customer',
        phone: phone || '',
      };
    }

    function isValidRole(candidate) {
      return candidate === 'admin' || candidate === 'sales';
    }

    function getRoleLabel(role) {
      return ROLE_CREDENTIALS[role]?.label ?? role;
    }

    function clearLoginForm() {
      if (loginForm) {
        loginForm.reset();
      }
      if (loginErrorAlert) {
        loginErrorAlert.classList.add('d-none');
      }
    }

    function showLoginModal() {
      if (!loginModalInstance) {
        return;
      }
      clearLoginForm();
      // Blur background except modal area
      try {
        document.body.classList.add('blurred');
      } catch (err) { }
      loginModalInstance.show();
    }

    function ensureAuthenticated() {
      if (!state.isAuthenticated) {
        setTimeout(() => showLoginModal(), 150);
      }
    }

    function handleLoginSubmit(event) {
      event.preventDefault();
      if (!loginUserIdInput || !loginPasswordInput) {
        return;
      }
      // show global loader while login is being processed
      try {
        document.getElementById('globalLoader')?.classList.add('show');
      } catch (err) { }
      const userId = loginUserIdInput.value.trim().toLowerCase();
      const password = loginPasswordInput.value;
      const credentialEntry = Object.entries(ROLE_CREDENTIALS).find(
        ([, creds]) => creds.username.toLowerCase() === userId,
      );
      const [matchedRole, credentials] = credentialEntry ?? [];
      const isValid =
        credentials &&
        password === credentials.password &&
        credentials.username.toLowerCase() === userId;

      if (!isValid) {
        if (loginErrorAlert) {
          loginErrorAlert.classList.remove('d-none');
        }
        try {
          document.getElementById('globalLoader')?.classList.remove('show');
        } catch (err) { }
        // keep blur while showing the error so user clearly sees the modal; remove only if they navigate away
        return;
      }

      state.isAuthenticated = true;
      state.activeRole = matchedRole;
      state.sessionUserId = credentials.username;
      persistSession();
      setRole(matchedRole, { skipRender: true });
      renderCategories();
      renderProducts();
      renderCart();
      updateRoleUi();
      // Strongly ensure modal/backdrop/blur are removed to avoid stuck UI.
      (function clearModalImmediatelyAndRetry() {
        try {
          const modalEl = document.getElementById('loginModal');
          // Use Bootstrap API if available
          try {
            loginModalInstance?.hide();
          } catch (err) {
            console.warn('loginModalInstance.hide() error', err);
          }

          // Dispose Bootstrap instance to remove internal state
          try {
            const inst = bootstrap?.Modal?.getInstance(modalEl) || bootstrap?.Modal?.getOrCreateInstance(modalEl);
            inst?.dispose?.();
          } catch (err) {
            // ignore
          }

          if (modalEl) {
            modalEl.classList.remove('show');
            modalEl.style.display = 'none';
            modalEl.removeAttribute('aria-modal');
            modalEl.removeAttribute('role');
          }

          // remove bootstrap backdrops and modal-open body class
          document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
          document.body.classList.remove('modal-open');

          // remove our blur and loader
          document.body.classList.remove('blurred');
          document.getElementById('globalLoader')?.classList.remove('show');
        } catch (err) {
          console.warn('clearModalImmediately error', err);
        }

        // Retry after short delay in case something reinserts backdrop/modal
        setTimeout(() => {
          try {
            document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
            const modalEl2 = document.getElementById('loginModal');
            if (modalEl2) {
              modalEl2.classList.remove('show');
              modalEl2.style.display = 'none';
            }
            document.body.classList.remove('modal-open');
            document.body.classList.remove('blurred');
            document.getElementById('globalLoader')?.classList.remove('show');
          } catch (err) {
            console.warn('clearModal retry error', err);
          }
        }, 300);
      })();
      // Robustly ensure modal and backdrop are removed (fixes cases where modal remains visible until refresh)
      try {
        const modalEl = document.getElementById('loginModal');
        if (modalEl) {
          modalEl.classList.remove('show');
          modalEl.style.display = 'none';
        }
        document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
        document.body.classList.remove('modal-open');
      } catch (err) {
        // non-fatal
      }
      clearLoginForm();
      // hide loader and remove blur after UI has updated
      setTimeout(() => {
        try {
          document.getElementById('globalLoader')?.classList.remove('show');
        } catch (err) { }
        try {
          document.body.classList.remove('blurred');
        } catch (err) { }
      }, 250);
    }

    function handleLogout() {
      state.isAuthenticated = false;
      state.sessionUserId = null;
      state.customer = { name: '', phone: '' };
      persistSession();
      setRole('sales');
      refreshPaymentUi();
      syncCustomerInputs();
      updateRoleUi();
      ensureAuthenticated();
    }

    function isDataUrl(value) {
      return typeof value === 'string' && value.startsWith('data:image');
    }

    function updateItemImagePreview(src) {
      if (!itemImagePreview) {
        return;
      }
      itemImagePreview.src = src || 'assets/img/placeholder.svg';
    }

    function resetItemImageState(imageSource = '') {
      pendingItemImageData = isDataUrl(imageSource) ? imageSource : null;
      updateItemImagePreview(imageSource || 'assets/img/placeholder.svg');
      if (itemImageInput) {
        itemImageInput.value = isDataUrl(imageSource) ? '' : imageSource || '';
      }
      if (itemImageFileInput) {
        itemImageFileInput.value = '';
      }
    }

    function handleItemImageFileChange(event) {
      const file = event.target.files?.[0];
      if (!file) {
        pendingItemImageData = null;
        updateItemImagePreview(itemImageInput?.value || 'assets/img/placeholder.svg');
        return;
      }
      if (file.size > 1024 * 1024 * 2) {
        alert('Please choose an image smaller than 2MB.');
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        pendingItemImageData = reader.result;
        updateItemImagePreview(pendingItemImageData);
      };
      reader.onerror = () => {
        alert('Unable to read the selected image file.');
      };
      reader.readAsDataURL(file);
    }

    function handleCustomerNameInput(event) {
      state.customer.name = event.target.value;
    }

    function handleCustomerPhoneInput(event) {
      state.customer.phone = event.target.value;
    }

    function updateRoleUi() {
      updateSessionUi();
    }

    function applyRolePermissions() {
      const adminVisible = state.isAuthenticated && isAdmin();
      adminOnlyControls.forEach((element) => {
        const hide = !adminVisible;
        element.classList.toggle('d-none', hide);
        if (hide && element.matches('button, a')) {
          element.setAttribute('tabindex', '-1');
          element.setAttribute('aria-disabled', 'true');
        } else {
          element.removeAttribute('tabindex');
          element.removeAttribute('aria-disabled');
        }
      });

      if (!adminVisible && settingsModalInstance) {
        settingsModalInstance.hide();
      }
    }

    function updateGstVisibility() {
      const enabled = isGstEnabled();
      gstHeaderCell?.classList.toggle('d-none', !enabled);
      gstSummaryRow?.classList.toggle('d-none', !enabled);
      document
        .querySelectorAll('.cart-gst-cell')
        .forEach((cell) => cell.classList.toggle('d-none', !enabled));
    }

    function applySettingsToUi() {
      const {
        shopName,
        shopTagline,
        shopAddress,
        shopContact,
        upiId,
        gstEnabled,
        gstNo,
        billSeries,
      } = state.settings;

      if (shopNameInput) {
        shopNameInput.value = shopName ?? '';
      }
      if (shopTaglineInput) {
        shopTaglineInput.value = shopTagline ?? '';
      }
      if (shopAddressInput) {
        shopAddressInput.value = shopAddress ?? '';
      }
      if (shopContactInput) {
        shopContactInput.value = shopContact ?? '';
      }
      if (gstNoInput) {
        gstNoInput.value = gstNo ?? '';
      }
      if (upiIdInput) {
        upiIdInput.value = upiId ?? '';
      }
      if (billSeriesInput) {
        billSeriesInput.value = billSeries ?? 1;
      }
      if (gstToggle) {
        gstToggle.checked = gstEnabled !== false;
      }
      if (navShopName) {
        navShopName.textContent = shopName || DEFAULT_SETTINGS.shopName;
      }
      if (navShopIcon) {
        const initial = (shopName || DEFAULT_SETTINGS.shopName || '').trim().charAt(0);
        navShopIcon.textContent = initial ? initial.toUpperCase() : '🏪';
      }
      if (companyNameEl) {
        companyNameEl.textContent = shopName || DEFAULT_SETTINGS.shopName;
      }
      if (companyTaglineEl) {
        const taglineText = shopTagline || DEFAULT_SETTINGS.shopTagline;
        companyTaglineEl.textContent = taglineText;
        companyTaglineEl.classList.toggle('d-none', !taglineText);
      }
      if (companyAddressEl) {
        const addressSafe = escapeHtml(shopAddress || '');
        const addressHtml = addressSafe.replace(/\n/g, '<br />');
        companyAddressEl.innerHTML = addressHtml;
        companyAddressEl.classList.toggle('d-none', !shopAddress);
      }
      if (companyContactEl) {
        companyContactEl.textContent =
          shopContact || DEFAULT_SETTINGS.shopContact || '';
      }
      document.title = `${shopName || DEFAULT_SETTINGS.shopName} – Point of Sale`;

      updateGstVisibility();
    }

    function setRole(role, { persist = true, skipRender = false } = {}) {
      state.activeRole = role === 'admin' ? 'admin' : 'sales';
      if (persist) {
        persistSession();
      }
      updateRoleUi();
      applyRolePermissions();
      if (!skipRender) {
        renderCategories();
        renderProducts();
        renderCart();
      }
    }

    function initNavigation() {
      // Set initial state
      if (!history.state) {
        history.replaceState({ view: 'home' }, document.title);
      }

      let isPoppingState = false;
      let isExiting = false;

      // Handle Popstate
      window.addEventListener('popstate', (event) => {
        if (isExiting) return;

        isPoppingState = true;
        const state = event.state;
        const openModal = document.querySelector('.modal.show');

        // If we are back at home but a modal is open, close it
        if (openModal && openModal.id !== 'exitModal') {
          const modalInstance = bootstrap.Modal.getInstance(openModal);
          if (modalInstance) modalInstance.hide();
        } 
        // If we went back past home (state is null or not home), show exit confirmation
        else if (!state || state.view !== 'home') {
          // Restore home state to prevent immediate exit
          history.pushState({ view: 'home' }, document.title);
          
          const exitModalEl = document.getElementById('exitModal');
          if (exitModalEl) {
            const exitModal = bootstrap.Modal.getOrCreateInstance(exitModalEl);
            exitModal.show();
          }
        }

        setTimeout(() => { isPoppingState = false; }, 50);
      });

      // Handle Modal Events
      document.querySelectorAll('.modal').forEach(modalEl => {
        modalEl.addEventListener('show.bs.modal', () => {
          if (isPoppingState) return;
          if (modalEl.id === 'exitModal') return;

          history.pushState({ view: 'modal', modalId: modalEl.id }, document.title);
        });

        modalEl.addEventListener('hide.bs.modal', () => {
          if (isPoppingState) return;
          if (modalEl.id === 'exitModal') return;

          // If user closed modal manually, go back to remove the modal state
          if (history.state?.view === 'modal' && history.state?.modalId === modalEl.id) {
            history.back();
          }
        });
      });

      // Handle Exit Confirm
      const confirmExitBtn = document.getElementById('confirmExitBtn');
      if (confirmExitBtn) {
        confirmExitBtn.addEventListener('click', () => {
          isExiting = true;
          history.back();
          setTimeout(() => {
            window.close();
            if (navigator.app && navigator.app.exitApp) {
              navigator.app.exitApp();
            }
          }, 100);
        });
      }
    }

    function init() {
      initNavigation();
      // Show loading spinner while data loads
      const loader = document.getElementById('globalLoader');
      if (loader) {
        loader.classList.add('show');
      }

      // If a central store is enabled, wait for it to sync localStorage first.
      if (
        window.CENTRAL_STORE_ENABLED &&
        window.CentralStore &&
        typeof window.CentralStore.init === 'function'
      ) {
        try {
          const inited = window.CentralStore.init(window.FIREBASE_CONFIG || {});
          if (inited && typeof window.CentralStore.fetchAndSync === 'function') {
            // fetch central snapshot and merge into localStorage; then run app init
            window.CentralStore.fetchAndSync().catch((err) => {
              console.warn('Central store fetch failed, falling back to local data', err);
              runAppInit();
            });

            const onSynced = () => {
              runAppInit();
              document.removeEventListener('central-data-synced', onSynced);
            };
            document.addEventListener('central-data-synced', onSynced);

            // Fallback: if central doesn't respond within 3s, continue with local data
            setTimeout(() => {
              if (!runAppInit._ran) runAppInit();
            }, 3000);
            return;
          }
        } catch (err) {
          console.warn('Central store initialization error', err);
        }
      }

      // No central store or failed to init — run local-only init
      runAppInit();
    }

    function runAppInit() {
      if (runAppInit._ran) return;
      runAppInit._ran = true;

      if (!productGrid) {
        return;
      }

      const storedCategories = getStoredData(STORAGE_KEYS.categories, null);
      if (storedCategories?.length) {
        state.categories = storedCategories;
      } else {
        state.categories = defaultData.categories;
        setStoredData(STORAGE_KEYS.categories, state.categories);
      }

      const storedItems = getStoredData(STORAGE_KEYS.items, null);
      if (storedItems?.length) {
        state.items = storedItems.map(normalizeItem);
      } else {
        state.items = defaultItems(state.categories).map(normalizeItem);
        setStoredData(STORAGE_KEYS.items, state.items);
      }

      const storedSettings = getStoredData(STORAGE_KEYS.settings, null);
      if (storedSettings) {
        state.settings = {
          ...state.settings,
          ...storedSettings,
        };
      } else {
        // Persist default settings if nothing is stored
        setStoredData(STORAGE_KEYS.settings, state.settings);
      }

      const storedSession = getStoredData(STORAGE_KEYS.session, null);
      if (
        storedSession?.authenticated &&
        storedSession?.activeRole &&
        isValidRole(storedSession.activeRole)
      ) {
        state.activeRole = storedSession.activeRole;
        state.isAuthenticated = true;
        state.sessionUserId =
          storedSession.userId || ROLE_CREDENTIALS[state.activeRole]?.username || null;
      } else {
        state.activeRole = 'sales';
        state.isAuthenticated = false;
        state.sessionUserId = null;
      }

      applySettingsToUi();
      updateSettingsPreview();
      refreshPaymentUi();
      syncCustomerInputs();
      setRole(state.activeRole, { persist: false, skipRender: true });

      state.selectedCategoryId = state.categories[0]?.id ?? null;

      bindEvents();
      if (categoryList) {
        renderCategories();
      }
      renderProducts();
      renderCart();
      updateSessionUi();
      ensureAuthenticated();

      // Hide loader once all data and UI is rendered
      const loader = document.getElementById('globalLoader');
      if (loader) {
        loader.classList.remove('show');
      }

      // Render settings tabs when modal is shown
      if (settingsModalElement) {
        settingsModalElement.addEventListener('shown.bs.modal', () => {
          renderCategoriesInSettings();
          renderProductsInSettings();
        });
      }

      // Add cleanup handlers for category and item modals to restore page interaction
      if (categoryModal) {
        categoryModal.addEventListener('hidden.bs.modal', () => {
          // Re-enable page scrolling and interaction
          document.body.classList.remove('modal-open');
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
          // Remove any lingering backdrops
          setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach((bd) => bd.remove());
          }, 50);
        });
      }

      if (itemModal) {
        itemModal.addEventListener('hidden.bs.modal', () => {
          // Re-enable page scrolling and interaction
          document.body.classList.remove('modal-open');
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
          // Remove any lingering backdrops
          setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach((bd) => bd.remove());
          }, 50);
        });
      }

      // Ensure cart is hidden by default on page load
      try {
        const cart = document.getElementById('draggableCart');
        if (cart) {
          cart.style.display = 'none';
        }
      } catch (err) {
        console.warn('Failed to apply initial cart state', err);
      }
    }

    function bindEvents() {
      document.getElementById('addCategoryBtn')?.addEventListener('click', () =>
        openCategoryModal(),
      );
      document.getElementById('addItemBtn')?.addEventListener('click', () =>
        openItemModal(),
      );
      document.getElementById('clearCartBtn')?.addEventListener('click', clearCart);
      document.getElementById('testBillBtn')?.addEventListener('click', createTestBill);
      document.getElementById('printBillBtn')?.addEventListener('click', printBill);
      document.getElementById('payNowBtn')?.addEventListener('click', showPayModal);

      // Add search functionality
      const productSearchInput = document.getElementById('productSearchInput');
      if (productSearchInput) {
        productSearchInput.addEventListener('input', (e) => {
          renderProducts(e.target.value);
        });
      }

      // Add data export/import
      document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
      document.getElementById('importDataBtn')?.addEventListener('click', handleImportDataClick);
      document.getElementById('dataImportInput')?.addEventListener('change', handleDataImportInput);

      // Draggable cart functionality
      setupDraggableCart();
      // Modal stacking helper for nested modals
      setupModalStacking();
      // Cart resize support
      setupCartResizer();

      // Top nav cart button: expand/collapse cart panel
      const toggleCart = (e) => {
        e.preventDefault();
        const cart = document.getElementById('draggableCart');
        if (cart) {
          if (cart.style.display === 'none') {
            // Expand: show full cart panel
            cart.style.display = 'block';
          } else {
            // Collapse: hide full cart panel, show menu button
            cart.style.display = 'none';
          }
        }
      };

      document.getElementById('mobileNavCartIcon')?.addEventListener('click', toggleCart);
      document.getElementById('desktopNavCartIcon')?.addEventListener('click', toggleCart);
      document.getElementById('addCustomItemBtn')?.addEventListener('click', () => {
        const modal = bootstrap.Modal.getOrCreateInstance(customItemModal);
        customItemForm.reset();
        modal.show();
      });

      customItemForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('customItemName').value.trim();
        const price = parseFloat(document.getElementById('customItemPrice').value);
        const qty = parseInt(document.getElementById('customItemQty').value, 10);
        const gst = parseFloat(document.getElementById('customItemGst').value);

        if (name && !isNaN(price) && qty > 0) {
          addCustomItemToCart(name, price, qty, isNaN(gst) ? 0 : gst);
          bootstrap.Modal.getInstance(customItemModal).hide();
        }
      });

      document.getElementById('minimizeCartBtn')?.addEventListener('click', () => {
        // Minimize button on cart header: collapse to menu
        const cart = document.getElementById('draggableCart');
        if (cart) {
          cart.style.display = 'none';
        }
      });

      categoryForm?.addEventListener('submit', handleCategorySubmit);
      itemForm?.addEventListener('submit', handleItemSubmit);
      settingsForm?.addEventListener('submit', handleSettingsSubmit);
      upiIdInput?.addEventListener('input', updateSettingsPreview);
      customerNameInput?.addEventListener('input', handleCustomerNameInput);
      customerPhoneInput?.addEventListener('input', handleCustomerPhoneInput);
      itemImageFileInput?.addEventListener('change', handleItemImageFileChange);
      itemImageInput?.addEventListener('input', () =>
        updateItemImagePreview(
          pendingItemImageData || itemImageInput.value.trim() || 'assets/img/placeholder.svg',
        ),
      );
      resetItemImageBtn?.addEventListener('click', () => resetItemImageState(''));
      downloadTemplateBtn?.addEventListener('click', downloadItemTemplate);
      exportItemsBtn?.addEventListener('click', exportItemsWorkbook);
      importItemsBtn?.addEventListener('click', handleImportItemsClick);
      itemImportInput?.addEventListener('change', handleItemImportInput);
      // Also bind the duplicate buttons in settings modal
      document.getElementById('downloadTemplateBtn2')?.addEventListener('click', downloadItemTemplate);
      document.getElementById('exportItemsBtn2')?.addEventListener('click', exportItemsWorkbook);
      document.getElementById('importItemsBtn2')?.addEventListener('click', handleImportItemsClick);
      document.getElementById('clearSalesDataBtn')?.addEventListener('click', clearSalesData);
      openLoginModalBtn?.addEventListener('click', showLoginModal);
      logoutBtn?.addEventListener('click', handleLogout);
      loginForm?.addEventListener('submit', handleLoginSubmit);
      loginModalElement?.addEventListener('shown.bs.modal', () => {
        loginUserIdInput?.focus();
      });
      // When login modal is hidden, remove any blur and loader left behind
      loginModalElement?.addEventListener('hidden.bs.modal', () => {
        try {
          document.body.classList.remove('blurred');
        } catch (err) { }
        try {
          document.getElementById('globalLoader')?.classList.remove('show');
        } catch (err) { }
      });

      completeSaleBtn?.addEventListener('click', () => {
        const sale = recordSale({ silent: true });
        payModalInstance?.hide();
        if (sale) {
          const invoiceModel = buildInvoiceModel({
            lineItems: sale.items,
            totals: {
              subtotal: sale.subtotal,
              tax: sale.tax,
              total: sale.total,
            },
            timestamp: new Date(sale.timestamp),
            billNumber: sale.billNumber,
            customer: sale.customer,
            gstEnabledOverride: sale.gstEnabled,
            settings: state.settings,
          });
          printInvoice(invoiceModel);
        }
      });
    }

    function renderCategories() {
      if (!categoryList) {
        // categoryList element not present on this page/view, skip rendering
        return;
      }
      categoryList.innerHTML = '';
      if (!state.categories.length) {
        categoryList.innerHTML =
          '<div class="list-group-item text-muted">No categories yet</div>';
        if (categoryTitle) categoryTitle.textContent = 'Products';
        return;
      }

      state.categories.forEach((category) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${category.id === state.selectedCategoryId ? 'active' : ''
          }`;
        const actions = isAdmin()
          ? `<span class="btn-group btn-group-sm category-actions">
            <button class="btn btn-outline-light edit-category" data-id="${category.id}" aria-label="Edit category">✎</button>
            <button class="btn btn-outline-light delete-category" data-id="${category.id}" aria-label="Delete category">🗑</button>
          </span>`
          : '';
        button.innerHTML = `
        <span>
          <strong>${category.name}</strong>
          <br />
          <small class="text-muted">${category.description || ''}</small>
        </span>
        ${actions}
      `;

        button.addEventListener('click', (event) => {
          if (
            event.target.closest('.edit-category') ||
            event.target.closest('.delete-category')
          ) {
            return;
          }
          state.selectedCategoryId = category.id;
          renderCategories();
          renderProducts();
        });

        if (isAdmin()) {
          button
            .querySelector('.edit-category')
            ?.addEventListener('click', (event) => {
              event.stopPropagation();
              openCategoryModal(category);
            });

          button
            .querySelector('.delete-category')
            ?.addEventListener('click', (event) => {
              event.stopPropagation();
              deleteCategory(category.id);
            });
        }

        categoryList.appendChild(button);
      });

      const selected = state.categories.find(
        (cat) => cat.id === state.selectedCategoryId,
      );
      categoryTitle.textContent = selected ? selected.name : 'Products';
      populateCategorySelect();
    }

    function renderProducts(searchQuery = '') {
      if (!productGrid) {
        // productGrid element not present, skip rendering
        return;
      }
      productGrid.innerHTML = '';

      // Show all products, optionally filtered by search query
      let itemsToDisplay = state.items;

      // Filter by search query if provided
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        itemsToDisplay = itemsToDisplay.filter((item) => {
          const matchesName = item.name.toLowerCase().includes(query);
          const matchesBrand = (item.brand || '').toLowerCase().includes(query);
          const matchesCategory = getCategoryNameById(item.categoryId).toLowerCase().includes(query);
          const matchesDescription = (item.description || '').toLowerCase().includes(query);
          return matchesName || matchesBrand || matchesCategory || matchesDescription;
        });
      }

      if (!itemsToDisplay.length) {
        const message = searchQuery && searchQuery.trim()
          ? 'No products match your search.'
          : 'No items available yet.';
        productGrid.innerHTML = `<div class="col"><div class="alert alert-info mb-0">${message}</div></div>`;
        return;
      }

      itemsToDisplay.forEach((item) => {
        const availableStock = getAvailableStock(item.id);
        const stockManaged = isStockManaged(item);
        const outOfStock = stockManaged && availableStock <= 0;
        const lowStock = stockManaged && availableStock > 0 && availableStock <= 5;
        const stockBadge = stockManaged
          ? `<span class="badge ${outOfStock
            ? 'bg-danger'
            : lowStock
              ? 'bg-warning text-dark'
              : 'bg-success'
          } stock-badge">${formatStockLabel({
            ...item,
            stock: availableStock,
          })}</span>`
          : '<span class="badge bg-success stock-badge">In Stock</span>';

        const col = document.createElement('div');
        col.className = 'col';
        // Remove action buttons from product view - they're now in settings only
        const categoryLabel = getCategoryNameById(item.categoryId);
        col.innerHTML = `
        <div class="card product-card h-100" data-id="${item.id}">
          <img src="${item.image || 'assets/img/placeholder.svg'}" class="card-img-top" alt="${item.name}" onerror="this.onerror=null;this.src='assets/img/placeholder.svg';" />
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <h5 class="card-title mb-1">${item.name}</h5>
                ${item.brand ? `<div class="text-muted small">${escapeHtml(item.brand)}</div>` : ''}
                <div class="text-muted small" style="font-size: 0.85rem;">📁 ${escapeHtml(categoryLabel)}</div>
              </div>
              ${stockBadge}
            </div>
            ${item.description ? `<p class="card-text text-muted small mb-1">${item.description}</p>` : ''}
            <p class="card-text text-muted small mb-2">GST: ${formatGstRateLabel(item.gstRate)}%</p>
            <div class="mt-auto">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold text-primary">₹${item.price.toFixed(2)}</span>
              </div>
              <button class="btn btn-primary w-100 add-to-cart" data-id="${item.id}" ${outOfStock ? 'disabled' : ''
          }>
                ${outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </button>
            </div>
          </div>
        </div>
      `;

        col.querySelector('.add-to-cart').addEventListener('click', () =>
          addToCart(item.id),
        );

        productGrid.appendChild(col);
      });
    }

    function renderCart() {
      if (!cartTableBody) {
        // cartTableBody element not present, skip rendering
        return;
      }
      cartTableBody.innerHTML = '';
      // Update top nav badge
      const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
      const badgeText = count > 0 ? count : '0';

      const mobileBadge = document.getElementById('mobileNavCartBadge');
      if (mobileBadge) mobileBadge.textContent = badgeText;

      const desktopBadge = document.getElementById('desktopNavCartBadge');
      if (desktopBadge) desktopBadge.textContent = badgeText;

      if (!state.cart.length) {
        cartTableBody.innerHTML =
          '<tr><td colspan="5" class="text-center text-muted">Cart is empty</td></tr>';
        if (cartCount) cartCount.textContent = '0 items';
        updateTotals();
        return;
      }

      const gstEnabled = isGstEnabled();

      state.cart.forEach((cartItem) => {
        let item = state.items.find((it) => it.id === cartItem.itemId);

        // Handle custom items
        if (!item && cartItem.isCustom) {
          item = {
            id: cartItem.itemId,
            name: cartItem.name,
            price: cartItem.customPrice,
            gstRate: cartItem.gstRate,
            stock: null, // Unlimited stock for custom items
            brand: 'Manual',
          };
        }

        if (!item) {
          return;
        }

        const price = cartItem.customPrice ?? item.price ?? 0;
        const quantity = cartItem.quantity;
        const stockManaged = isStockManaged(item);
        const remainingStock = stockManaged ? item.stock - quantity : Number.POSITIVE_INFINITY;
        const gstRate = sanitizeGstRate(
          typeof cartItem.gstRate === 'number' ? cartItem.gstRate : item.gstRate,
        );
        cartItem.gstRate = gstRate;

        const lineSubtotal = price * quantity;
        const effectiveGstRate = gstEnabled ? gstRate : 0;
        const gstAmount = lineSubtotal * (effectiveGstRate / 100);
        const lineTotal = lineSubtotal + gstAmount;
        const gstCellClass = gstEnabled ? '' : 'd-none';
        const gstInputState = gstEnabled ? '' : 'disabled';

        const row = document.createElement('tr');
        row.innerHTML = `
    <td>
      <div class="fw-semibold">${item.name}</div>
      ${item.brand ? `<div class="text-muted small">${escapeHtml(item.brand)}</div>` : ''}
      <div class="input-group input-group-sm mt-1" style="width: 120px;">
        <span class="input-group-text">₹</span>
        <input type="number" class="form-control cart-price-input" data-id="${item.id}" value="${price}" min="0" step="0.01">
      </div>
      ${stockManaged
            ? `<div class="small ${remainingStock < 0 ? 'text-danger' : 'text-muted'}">
              Stock left: ${Math.max(0, remainingStock)}
             </div>`
            : ''
          }
    </td>
    <td class="text-center">
      <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-outline-secondary decrease" data-id="${item.id}">-</button>
        <span class="btn btn-outline-light disabled">${cartItem.quantity}</span>
        <button class="btn btn-outline-secondary increase" data-id="${item.id}" ${stockManaged && cartItem.quantity >= item.stock ? 'disabled' : ''
          }>+</button>
      </div>
    </td>
    <td class="text-center cart-gst-cell ${gstCellClass}">
      <input
        type="number"
        class="form-control form-control-sm cart-gst-input"
        data-id="${item.id}"
        min="0"
        step="0.1"
        value="${formatGstRateInput(gstRate)}"
        ${gstInputState}
      />
    </td>
    <td class="text-end">₹${lineTotal.toFixed(2)}</td>
    <td class="text-end">
      <button class="btn btn-sm btn-outline-danger remove" data-id="${item.id}">✕</button>
    </td>
  `;

        row.querySelector('.cart-price-input').addEventListener('change', (e) => {
          const newPrice = parseFloat(e.target.value);
          if (!isNaN(newPrice) && newPrice >= 0) {
            updateCartPrice(item.id, newPrice);
          }
        });

        row.querySelector('.decrease').addEventListener('click', () =>
          updateQuantity(item.id, cartItem.quantity - 1),
        );
        row.querySelector('.increase').addEventListener('click', () =>
          updateQuantity(item.id, cartItem.quantity + 1),
        );
        row.querySelector('.remove').addEventListener('click', () =>
          removeFromCart(item.id),
        );
        if (gstEnabled) {
          row
            .querySelector('.cart-gst-input')
            .addEventListener('change', (event) =>
              updateCartGst(item.id, event.target.value),
            );
        }

        cartTableBody.appendChild(row);
      });

      cartCount.textContent = `${state.cart.reduce(
        (sum, item) => sum + item.quantity,
        0,
      )} items`;

      updateTotals();
      updateGstVisibility();
    }

    function downloadItemTemplate() {
      if (!ensureSheetJsAvailable()) {
        return;
      }
      const header = [
        ['Name', 'Brand', 'Price', 'GST', 'Stock', 'Category', 'Description', 'ImageURL'],
      ];
      const itemsSheet = window.XLSX.utils.aoa_to_sheet(header);
      const categoryRows = [
        ['Name', 'Description'],
        ...state.categories.map((category) => [
          category.name,
          category.description || '',
        ]),
      ];
      const categoriesSheet = window.XLSX.utils.aoa_to_sheet(categoryRows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Items');
      window.XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Categories');
      window.XLSX.writeFile(workbook, 'item-template.xlsx', { compression: true });
    }

    function exportItemsWorkbook() {
      if (!ensureSheetJsAvailable()) {
        return;
      }
      const rows = [
        ['Name', 'Brand', 'Price', 'GST', 'Stock', 'Category', 'Description', 'ImageURL'],
        ...state.items.map((item) => [
          item.name,
          item.brand || '',
          Number(item.price ?? 0),
          sanitizeGstRate(item.gstRate ?? 0),
          isStockManaged(item) ? item.stock : '',
          getCategoryNameById(item.categoryId),
          item.description || '',
          item.image || '',
        ]),
      ];
      const itemsSheet = window.XLSX.utils.aoa_to_sheet(rows);
      const categoryRows = [
        ['Name', 'Description'],
        ...state.categories.map((category) => [
          category.name,
          category.description || '',
        ]),
      ];
      const categoriesSheet = window.XLSX.utils.aoa_to_sheet(categoryRows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Items');
      window.XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Categories');
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+/, '');
      window.XLSX.writeFile(workbook, `items-export-${timestamp}.xlsx`, {
        compression: true,
      });
    }

    function handleImportItemsClick() {
      if (!ensureSheetJsAvailable()) {
        return;
      }
      itemImportInput?.click();
    }

    function handleItemImportInput(event) {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (!ensureSheetJsAvailable()) {
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        try {
          const data = new Uint8Array(loadEvent.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          applyItemsImport(workbook);
        } catch (error) {
          console.error('Failed to import items', error);
          alert('Unable to import the selected file. Please verify the template format.');
        } finally {
          event.target.value = '';
        }
      };
      reader.onerror = () => {
        alert('Unable to read the selected file.');
        event.target.value = '';
      };
      reader.readAsArrayBuffer(file);
    }

    function applyItemsImport(workbook) {
      const sheetNames = workbook.SheetNames ?? [];
      if (!sheetNames.length) {
        alert('The uploaded workbook is empty.');
        return;
      }

      const itemsSheetName =
        sheetNames.find((name) => name.toLowerCase() === 'items') ?? sheetNames[0];
      const itemsSheet = workbook.Sheets[itemsSheetName];
      if (!itemsSheet) {
        alert('Items sheet not found in the workbook.');
        return;
      }

      const categorySheetName = sheetNames.find(
        (name) => name.toLowerCase() === 'categories',
      );
      if (categorySheetName) {
        const categorySheet = workbook.Sheets[categorySheetName];
        if (categorySheet) {
          const categoryRows = window.XLSX.utils.sheet_to_json(categorySheet, {
            header: 1,
            defval: '',
          });
          categoryRows.shift(); // headers
          categoryRows.forEach((row) => {
            const [rawName, rawDescription] = row;
            const name = typeof rawName === 'string' ? rawName.trim() : '';
            if (!name) {
              return;
            }
            const description =
              typeof rawDescription === 'string' ? rawDescription.trim() : '';
            const existing = state.categories.find(
              (cat) => cat.name.trim().toLowerCase() === name.toLowerCase(),
            );
            if (existing) {
              existing.description = description;
            } else {
              const newCategory = {
                id: crypto.randomUUID(),
                name,
                description,
              };
              state.categories.push(newCategory);
            }
          });
        }
      }

      const itemRows = window.XLSX.utils.sheet_to_json(itemsSheet, {
        header: 1,
        defval: '',
      });
      if (!itemRows.length) {
        alert('No item rows found to import.');
        return;
      }
      const headerRow = itemRows.shift().map((cell) =>
        cell?.toString().trim().toLowerCase(),
      );
      const columnIndex = {
        name: headerRow.indexOf('name'),
        brand: headerRow.indexOf('brand'),
        price: headerRow.indexOf('price'),
        gst: headerRow.indexOf('gst'),
        stock: headerRow.indexOf('stock'),
        category: headerRow.indexOf('category'),
        description: headerRow.indexOf('description'),
        image: headerRow.indexOf('imageurl'),
      };

      const getCellValue = (row, index) =>
        index >= 0 && index < row.length ? row[index] : '';

      const categoryLookup = new Map(
        state.categories.map((cat) => [cat.name.trim().toLowerCase(), cat]),
      );

      itemRows.forEach((row) => {
        const rawName = getCellValue(row, columnIndex.name);
        const name =
          typeof rawName === 'string' ? rawName.trim() : rawName?.toString().trim();
        if (!name) {
          return;
        }
        const rawBrand = getCellValue(row, columnIndex.brand);
        const brand =
          typeof rawBrand === 'string'
            ? rawBrand.trim()
            : rawBrand !== undefined && rawBrand !== null
              ? String(rawBrand).trim()
              : '';
        const rawPrice = getCellValue(row, columnIndex.price);
        const price = parseFloat(rawPrice) || 0;
        const gstValue = getCellValue(row, columnIndex.gst);
        const gstRate = sanitizeGstRate(gstValue);
        const stockValue = sanitizeStock(getCellValue(row, columnIndex.stock));
        const categoryNameCell = getCellValue(row, columnIndex.category);
        const categoryName =
          typeof categoryNameCell === 'string'
            ? categoryNameCell.trim()
            : categoryNameCell?.toString().trim();
        const descriptionCell = getCellValue(row, columnIndex.description);
        const description =
          typeof descriptionCell === 'string'
            ? descriptionCell.trim()
            : descriptionCell?.toString().trim() ?? '';
        const image =
          getCellValue(row, columnIndex.image)?.toString().trim() ||
          'assets/img/placeholder.svg';

        let category = categoryLookup.get((categoryName || '').toLowerCase());
        if (!category) {
          if (categoryName) {
            category = {
              id: crypto.randomUUID(),
              name: categoryName,
              description: '',
            };
            state.categories.push(category);
            categoryLookup.set(categoryName.toLowerCase(), category);
          } else if (state.categories.length) {
            category = state.categories[0];
          } else {
            category = {
              id: crypto.randomUUID(),
              name: 'General',
              description: '',
            };
            state.categories.push(category);
            categoryLookup.set('general', category);
          }
        }

        const normalizedItem = normalizeItem({
          id: crypto.randomUUID(),
          name,
          brand,
          price,
          gstRate,
          stock: stockValue,
          categoryId: category?.id ?? null,
          description,
          image,
        });

        const existing = state.items.find((candidate) => {
          const sameName =
            candidate.name.trim().toLowerCase() === normalizedItem.name.trim().toLowerCase();
          const sameBrand =
            (candidate.brand || '').trim().toLowerCase() ===
            (normalizedItem.brand || '').trim().toLowerCase();
          return sameName && sameBrand;
        });

        if (existing) {
          existing.name = normalizedItem.name;
          existing.brand = normalizedItem.brand;
          existing.price = normalizedItem.price;
          existing.gstRate = normalizedItem.gstRate;
          existing.categoryId = normalizedItem.categoryId;
          existing.description = normalizedItem.description;
          existing.image = normalizedItem.image;
          existing.stock = normalizedItem.stock;
        } else {
          state.items.push({
            ...normalizedItem,
            id: normalizedItem.id || crypto.randomUUID(),
          });
        }
      });

      if (!state.categories.find((cat) => cat.id === state.selectedCategoryId)) {
        state.selectedCategoryId = state.categories[0]?.id ?? null;
      }

      setStoredData(STORAGE_KEYS.categories, state.categories);
      setStoredData(STORAGE_KEYS.items, state.items);
      renderCategories();
      renderProducts();
      renderCart();
      alert('Items imported successfully.');
    }

    function updateCartPrice(itemId, newPrice) {
      const cartItem = state.cart.find((ci) => ci.itemId === itemId);
      if (cartItem) {
        cartItem.customPrice = newPrice;
        renderCart();
      }
    }

    function addCustomItemToCart(name, price, qty, gstRate) {
      const id = `custom-${crypto.randomUUID()}`;
      state.cart.push({
        itemId: id,
        quantity: qty,
        gstRate: gstRate,
        customPrice: price,
        isCustom: true,
        name: name,
      });
      renderCart();
    }

    function updateTotals() {
      const { subtotal, tax, total } = computeTotals(
        state.cart.map((cartItem) => {
          let item = state.items.find((it) => it.id === cartItem.itemId);
          if (!item && cartItem.isCustom) {
            item = { price: cartItem.customPrice, gstRate: cartItem.gstRate };
          }
          return {
            price: cartItem.customPrice ?? item?.price ?? 0,
            quantity: cartItem.quantity,
            gstRate:
              typeof cartItem.gstRate === 'number'
                ? cartItem.gstRate
                : item?.gstRate ?? 0,
          };
        }),
      );

      subtotalValue.textContent = formatCurrency(subtotal);
      taxValue.textContent = formatCurrency(tax);
      totalValue.textContent = formatCurrency(total);
      payModalTotal.textContent = formatCurrency(total);
      state.lastTotals = { subtotal, tax, total };
      refreshPaymentUi();
      updateGstVisibility();
    }

    function addToCart(itemId) {
      const item = state.items.find((it) => it.id === itemId);
      if (!item) {
        return;
      }
      if (getAvailableStock(itemId) <= 0) {
        alert('This item is out of stock.');
        return;
      }
      const defaultGst = sanitizeGstRate(item?.gstRate ?? 0);
      const existing = state.cart.find((ci) => ci.itemId === itemId);
      if (existing) {
        if (isStockManaged(item) && existing.quantity + 1 > item.stock) {
          alert('Insufficient stock available.');
          return;
        }
        existing.quantity += 1;
        if (typeof existing.gstRate !== 'number') {
          existing.gstRate = defaultGst;
        }
      } else {
        state.cart.push({ itemId, quantity: 1, gstRate: defaultGst });
      }
      renderCart();
      renderProducts();
    }

    function updateQuantity(itemId, quantity) {
      if (quantity <= 0) {
        removeFromCart(itemId);
        return;
      }
      const cartItem = state.cart.find((ci) => ci.itemId === itemId);
      if (cartItem) {
        const product = state.items.find((it) => it.id === itemId);
        if (product && isStockManaged(product) && quantity > product.stock) {
          alert(`Only ${product.stock} unit(s) available in stock.`);
          return;
        }
        cartItem.quantity = quantity;
      }
      renderCart();
      renderProducts();
    }

    function updateCartGst(itemId, gstRateValue) {
      if (!isGstEnabled()) {
        return;
      }
      const cartItem = state.cart.find((ci) => ci.itemId === itemId);
      if (!cartItem) {
        return;
      }
      cartItem.gstRate = sanitizeGstRate(gstRateValue);
      renderCart();
    }

    function removeFromCart(itemId) {
      state.cart = state.cart.filter((ci) => ci.itemId !== itemId);
      renderCart();
      renderProducts();
    }

    function clearCart() {
      if (!state.cart.length) return;
      if (confirm('Remove all items from the cart?')) {
        state.cart = [];
        renderCart();
        renderProducts();
      }
    }

    function createTestBill() {
      // Clear existing cart
      state.cart = [];

      // Add first 2-3 items to cart for testing
      if (state.items.length > 0) {
        state.cart.push({
          itemId: state.items[0].id,
          quantity: 1,
          gstRate: state.items[0].gstRate ?? 0,
        });
      }
      if (state.items.length > 1) {
        state.cart.push({
          itemId: state.items[1].id,
          quantity: 1,
          gstRate: state.items[1].gstRate ?? 0,
        });
      }
      if (state.items.length > 2) {
        state.cart.push({
          itemId: state.items[2].id,
          quantity: 2,
          gstRate: state.items[2].gstRate ?? 0,
        });
      }

      // Add customer details for test
      state.customer.name = 'Test Customer';
      state.customer.phone = '9999999999';

      renderCart();
      renderProducts();
      alert('Test items added to cart. Click Print Bill to see the bill.');
    }

    function openCategoryModal(category) {
      if (!isAdmin()) {
        alert('Only admin users can manage categories.');
        return;
      }
      const modal = bootstrap.Modal.getOrCreateInstance(categoryModal);
      categoryForm.reset();
      document.getElementById('categoryId').value = category?.id ?? '';
      document.getElementById('categoryName').value = category?.name ?? '';
      document.getElementById('categoryDescription').value =
        category?.description ?? '';

      document.getElementById('categoryModalLabel').textContent = category
        ? 'Edit Category'
        : 'Add Category';

      modal.show();
    }

    function handleCategorySubmit(event) {
      event.preventDefault();
      if (!isAdmin()) {
        alert('Only admin users can manage categories.');
        return;
      }
      const idInput = document.getElementById('categoryId').value;
      const name = document.getElementById('categoryName').value.trim();
      const description = document.getElementById('categoryDescription').value.trim();

      if (!name) {
        alert('Category name is required.');
        return;
      }

      if (idInput) {
        const category = state.categories.find((cat) => cat.id === idInput);
        if (category) {
          category.name = name;
          category.description = description;
        }
      } else {
        const newCategory = {
          id: crypto.randomUUID(),
          name,
          description,
        };
        state.categories.push(newCategory);
        state.selectedCategoryId = newCategory.id;
      }

      setStoredData(STORAGE_KEYS.categories, state.categories);
      renderCategories();
      renderProducts();

      bootstrap.Modal.getInstance(categoryModal)?.hide();
    }

    function deleteCategory(categoryId) {
      if (!isAdmin()) {
        alert('Only admin users can manage categories.');
        return;
      }
      const category = state.categories.find((cat) => cat.id === categoryId);
      if (!category) return;
      if (
        !confirm(
          `Delete category "${category.name}" and all its items? This action cannot be undone.`,
        )
      ) {
        return;
      }

      state.categories = state.categories.filter((cat) => cat.id !== categoryId);
      state.items = state.items.filter((item) => item.categoryId !== categoryId);
      setStoredData(STORAGE_KEYS.categories, state.categories);
      setStoredData(STORAGE_KEYS.items, state.items);

      if (state.selectedCategoryId === categoryId) {
        state.selectedCategoryId = state.categories[0]?.id ?? null;
      }
      renderCategories();
      renderProducts();
    }

    function openItemModal(item) {
      if (!state.categories.length) {
        alert('Please add a category before adding items.');
        return;
      }
      if (!isAdmin()) {
        alert('Only admin users can manage products.');
        return;
      }

      const modal = bootstrap.Modal.getOrCreateInstance(itemModal);
      itemForm.reset();

      document.getElementById('itemId').value = item?.id ?? '';
      document.getElementById('itemName').value = item?.name ?? '';
      if (itemBrandInput) {
        itemBrandInput.value = item?.brand ?? '';
      }
      if (itemPriceInput) {
        itemPriceInput.value = item?.price ?? '';
      } else {
        document.getElementById('itemPrice').value = item?.price ?? '';
      }
      if (itemStockInput) {
        itemStockInput.value =
          typeof item?.stock === 'number' && item.stock >= 0 ? item.stock : '';
      }
      resetItemImageState(item?.image ?? '');
      document.getElementById('itemGstRate').value = (item?.gstRate ?? 0).toString();
      document.getElementById('itemDescription').value = item?.description ?? '';
      populateCategorySelect(item?.categoryId ?? state.selectedCategoryId);

      document.getElementById('itemModalLabel').textContent = item
        ? 'Edit Item'
        : 'Add Item';

      modal.show();
    }

    function populateCategorySelect(selectedId = null) {
      const select = document.getElementById('itemCategory');
      if (!select) return;
      select.innerHTML = '';

      state.categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        if (category.id === selectedId) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }

    function handleItemSubmit(event) {
      event.preventDefault();
      if (!isAdmin()) {
        alert('Only admin users can manage products.');
        return;
      }
      const idInput = document.getElementById('itemId').value;
      const name = document.getElementById('itemName').value.trim();
      const brand = itemBrandInput?.value.trim() ?? '';
      const priceValue =
        itemPriceInput?.value ?? document.getElementById('itemPrice').value;
      const price = parseFloat(priceValue);
      const stockValue = itemStockInput?.value ?? '';
      const stock = sanitizeStock(stockValue);
      const existingItem = idInput ? state.items.find((it) => it.id === idInput) : null;
      const imageUrlInput = itemImageInput?.value.trim() ?? '';
      const finalImage =
        pendingItemImageData ||
        imageUrlInput ||
        existingItem?.image ||
        'assets/img/placeholder.svg';
      const gstRateInput = document.getElementById('itemGstRate').value;
      const gstRate = sanitizeGstRate(gstRateInput);
      const categoryId = document.getElementById('itemCategory').value;
      const description = document
        .getElementById('itemDescription')
        .value.trim();

      if (!name || Number.isNaN(price) || price < 0) {
        alert('Please provide valid item details.');
        return;
      }

      if (idInput) {
        if (existingItem) {
          existingItem.name = name;
          existingItem.price = price;
          existingItem.brand = brand;
          existingItem.image = finalImage;
          existingItem.categoryId = categoryId;
          existingItem.description = description;
          existingItem.gstRate = gstRate;
          existingItem.stock = stock;
        }
      } else {
        state.items.push({
          id: crypto.randomUUID(),
          name,
          price,
          brand,
          image: finalImage,
          categoryId,
          description,
          gstRate,
          stock,
        });
      }

      setStoredData(STORAGE_KEYS.items, state.items);
      renderProducts();
      renderCart();

      pendingItemImageData = null;
      bootstrap.Modal.getInstance(itemModal)?.hide();
    }

    function deleteItem(itemId) {
      if (!isAdmin()) {
        alert('Only admin users can manage products.');
        return;
      }
      const item = state.items.find((it) => it.id === itemId);
      if (!item) return;
      if (!confirm(`Delete "${item.name}"?`)) {
        return;
      }

      state.items = state.items.filter((it) => it.id !== itemId);
      setStoredData(STORAGE_KEYS.items, state.items);
      removeFromCart(itemId);
      renderProducts();
    }

    function showPayModal() {
      if (!state.cart.length) {
        alert('Cart is empty.');
        return;
      }
      updateTotals();
      refreshPaymentUi();
      payModalInstance?.show();
    }

    function recordSale({ silent = false } = {}) {
      refreshCustomerStateFromInputs();
      if (!state.cart.length) {
        if (!silent) {
          alert('Cart is empty.');
        }
        return null;
      }

      const sales = getStoredData(STORAGE_KEYS.sales, []);
      const timestamp = new Date();
      const gstEnabled = isGstEnabled();
      const billSeries = state.settings.billSeries ?? DEFAULT_SETTINGS.billSeries;
      const billNumber = generateBillNumber(timestamp, billSeries);
      const customerInfo = getCustomerSnapshot();

      const lineItems = state.cart
        .map((cartItem) => {
          let product = state.items.find((it) => it.id === cartItem.itemId);
          if (!product && cartItem.isCustom) {
            product = {
              id: cartItem.itemId,
              name: cartItem.name,
              price: cartItem.customPrice,
              gstRate: cartItem.gstRate,
              brand: 'Manual',
            };
          }

          // Use custom price if available
          const effectiveProduct = { ...product, price: cartItem.customPrice ?? product?.price ?? 0 };

          const baseGstRate =
            typeof cartItem.gstRate === 'number'
              ? cartItem.gstRate
              : product?.gstRate ?? 0;
          return buildInvoiceLineItem({
            product: effectiveProduct,
            quantity: cartItem.quantity,
            gstRate: baseGstRate,
            gstEnabledOverride: gstEnabled,
          });
        })
        .filter(Boolean);

      if (!lineItems.length) {
        if (!silent) {
          alert('No valid items to record.');
        }
        return null;
      }

      const totals = calculateTotalsFromLineItems(lineItems);

      const saleRecord = {
        id: crypto.randomUUID(),
        billNumber,
        timestamp: timestamp.toISOString(),
        items: lineItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        gstEnabled,
        customer: customerInfo,
      };

      lineItems.forEach((lineItem) => {
        const product = state.items.find((prod) => prod.id === lineItem.id);
        if (product && isStockManaged(product)) {
          product.stock = Math.max(0, product.stock - lineItem.quantity);
        }
      });

      sales.push(saleRecord);
      setStoredData(STORAGE_KEYS.sales, sales);
      setStoredData(STORAGE_KEYS.items, state.items);

      // If central store is enabled, attempt to push the sale to the central DB as well
      try {
        if (window.CENTRAL_STORE_ENABLED && window.CentralStore && typeof window.CentralStore.pushSale === 'function') {
          window.CentralStore.pushSale(saleRecord).catch((err) => {
            console.warn('CentralStore.pushSale failed (non-fatal)', err);
          });
        }
      } catch (err) {
        console.warn('Central store push attempt failed', err);
      }

      state.settings.billSeries = billSeries + 1;
      setStoredData(STORAGE_KEYS.settings, state.settings);
      applySettingsToUi();

      state.cart = [];
      state.customer = { name: '', phone: '' };
      syncCustomerInputs();
      renderCart();
      renderProducts();

      if (!silent) {
        alert('Payment recorded successfully!');
      }

      return saleRecord;
    }

    function computeTotals(items) {
      const gstEnabled = isGstEnabled();
      const totals = items.reduce(
        (acc, item) => {
          const price = item.price ?? 0;
          const quantity = item.quantity ?? 0;
          const gstRate =
            typeof item.gstRate === 'number' && !Number.isNaN(item.gstRate)
              ? Math.max(0, item.gstRate)
              : 0;
          const lineSubtotal = price * quantity;
          const effectiveRate = gstEnabled ? gstRate : 0;
          const lineTax = lineSubtotal * (effectiveRate / 100);
          acc.subtotal += lineSubtotal;
          acc.tax += lineTax;
          acc.total += lineSubtotal + lineTax;
          return acc;
        },
        { subtotal: 0, tax: 0, total: 0 },
      );

      return {
        subtotal: roundCurrency(totals.subtotal),
        tax: roundCurrency(totals.tax),
        total: roundCurrency(totals.total),
      };
    }



    function sanitizeStock(value) {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseInt(value, 10)
            : Number.NaN;
      if (Number.isNaN(parsed) || parsed < 0) {
        return null;
      }
      return Math.floor(parsed);
    }

    function isStockManaged(item) {
      return typeof item?.stock === 'number' && item.stock >= 0;
    }

    function getCartQuantity(itemId) {
      return state.cart
        .filter((entry) => entry.itemId === itemId)
        .reduce((sum, entry) => sum + entry.quantity, 0);
    }

    function getAvailableStock(itemId) {
      const item = state.items.find((it) => it.id === itemId);
      if (!isStockManaged(item)) {
        return Number.POSITIVE_INFINITY;
      }
      const remaining = item.stock - getCartQuantity(itemId);
      return remaining < 0 ? 0 : remaining;
    }

    function formatStockLabel(item) {
      if (!isStockManaged(item)) {
        return 'In Stock';
      }
      if (item.stock <= 0) {
        return 'Out of Stock';
      }
      if (item.stock <= 5) {
        return `Low stock (${item.stock})`;
      }
      return `${item.stock} in stock`;
    }

    function ensureSheetJsAvailable() {
      if (typeof window.XLSX === 'undefined') {
        alert('Spreadsheet library not loaded. Check your network connection and try again.');
        return false;
      }
      return true;
    }

    function getCategoryNameById(categoryId) {
      return (
        state.categories.find((category) => category.id === categoryId)?.name ??
        'Uncategorised'
      );
    }



    function formatGstRateInput(rate) {
      return sanitizeGstRate(rate).toString();
    }



    function formatAmountForUpi(amount) {
      return roundCurrency(amount).toFixed(2);
    }

    function sanitizeUpiId(rawUpi) {
      if (!rawUpi) {
        return '';
      }
      return rawUpi.replace(/\s+/g, '').toLowerCase();
    }

    function isValidUpiId(upiId) {
      return /^[a-z0-9._-]+@[a-z0-9.-]+$/.test(upiId);
    }

    function buildUpiUri(upiId, amount) {
      const effectiveUpi = sanitizeUpiId(upiId) || DEFAULT_SETTINGS.upiId;
      const amountString = formatAmountForUpi(amount);
      return `upi://pay?pa=${effectiveUpi}&pn=Bill&am=${amountString}`;
    }

    function buildQrUrl(upiId, amount, size = 220) {
      const uri = buildUpiUri(upiId, amount);
      return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
        uri,
      )}`;
    }

    function updateSettingsPreview() {
      if (!settingsQrPreview) {
        return;
      }
      const candidateUpi = sanitizeUpiId(upiIdInput?.value?.trim() ?? '');
      const previewUpi =
        candidateUpi || state.settings.upiId || DEFAULT_SETTINGS.upiId;
      settingsQrPreview.src = buildQrUrl(previewUpi, 0, 180);
    }

    function handleSettingsSubmit(event) {
      event.preventDefault();
      if (!isAdmin()) {
        alert('Only admin users can update settings.');
        return;
      }
      if (!upiIdInput) {
        return;
      }
      const rawValue = upiIdInput.value.trim();
      const sanitizedValue = sanitizeUpiId(rawValue);
      if (!sanitizedValue || !isValidUpiId(sanitizedValue)) {
        alert('Please enter a valid UPI ID (e.g. shopname@bank).');
        return;
      }
      const shopName = shopNameInput?.value?.trim() || DEFAULT_SETTINGS.shopName;
      const shopTagline = shopTaglineInput?.value?.trim() ?? '';
      const shopAddress = shopAddressInput?.value?.trim() ?? '';
      const shopContact = shopContactInput?.value?.trim() ?? '';
      const gstNo = gstNoInput?.value?.trim() ?? '';
      const billSeriesValue = parseInt(billSeriesInput?.value ?? '1', 10);
      const gstEnabled = gstToggle ? gstToggle.checked : true;

      state.settings = {
        ...state.settings,
        shopName,
        shopTagline,
        shopAddress,
        shopContact,
        gstNo,
        upiId: sanitizedValue,
        gstEnabled,
        billSeries: Number.isNaN(billSeriesValue) || billSeriesValue < 1 ? 1 : billSeriesValue,
      };
      setStoredData(STORAGE_KEYS.settings, state.settings);
      applySettingsToUi();
      updateSettingsPreview();
      refreshPaymentUi();
      renderCart();
      alert('Settings updated successfully.');
    }

    function exportData() {
      if (!isAdmin()) {
        alert('Only admin users can export data.');
        return;
      }

      const exportObject = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        company: state.settings,
        categories: state.categories,
        products: state.items,
        sales: getStoredData(STORAGE_KEYS.sales, []),
      };

      const dataStr = JSON.stringify(exportObject, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
      link.download = `shop-data-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert('Data exported successfully.');
    }

    function handleImportDataClick() {
      if (!isAdmin()) {
        alert('Only admin users can import data.');
        return;
      }
      document.getElementById('dataImportInput')?.click();
    }

    function handleDataImportInput(event) {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        try {
          const importedData = JSON.parse(loadEvent.target.result);

          // Validate the imported data structure
          if (!importedData.company || !importedData.categories || !importedData.products) {
            alert('Invalid data format. Please use a valid export file.');
            return;
          }

          // Ask for confirmation
          if (!confirm('This will replace all current data. Continue?')) {
            return;
          }

          // Import settings
          state.settings = { ...state.settings, ...importedData.company };
          setStoredData(STORAGE_KEYS.settings, state.settings);

          // Import categories
          state.categories = importedData.categories || [];
          setStoredData(STORAGE_KEYS.categories, state.categories);

          // Import products
          state.items = (importedData.products || []).map(normalizeItem);
          setStoredData(STORAGE_KEYS.items, state.items);

          // Import sales if available
          if (importedData.sales && importedData.sales.length) {
            setStoredData(STORAGE_KEYS.sales, importedData.sales);
          }

          // Update selected category
          state.selectedCategoryId = state.categories[0]?.id ?? null;

          // Refresh UI
          applySettingsToUi();
          updateSettingsPreview();
          renderCategories();
          renderProducts();
          renderCart();
          alert('Data imported successfully.');
        } catch (error) {
          console.error('Failed to import data', error);
          alert('Unable to import the selected file. Please verify it\'s a valid JSON export.');
        } finally {
          event.target.value = '';
        }
      };

      reader.onerror = () => {
        alert('Unable to read the selected file.');
        event.target.value = '';
      };

      reader.readAsText(file);
    }

    function clearSalesData() {
      if (!isAdmin()) {
        alert('Only admin users can clear sales data.');
        return;
      }
      const sales = getStoredData(STORAGE_KEYS.sales, []);
      if (!sales.length) {
        alert('Sales data is already empty.');
        return;
      }

      if (confirm('Are you sure you want to clear ALL sales history? This action cannot be undone.')) {
        const password = prompt('Please enter the password to confirm deletion:');
        if (password === 'Delete@0000') {
          localStorage.removeItem(STORAGE_KEYS.sales);

          // Clear from central store if enabled
          if (window.CENTRAL_STORE_ENABLED && window.CentralStore && typeof window.CentralStore.clearSales === 'function') {
            window.CentralStore.clearSales().catch(err => console.warn('Failed to clear central sales', err));
          }

          alert('All sales data has been cleared.');
        } else {
          alert('Incorrect password. Action cancelled.');
        }
      }
    }

    function refreshPaymentUi() {
      const upiId = state.settings.upiId || DEFAULT_SETTINGS.upiId;
      const amount = state.lastTotals.total ?? 0;
      if (upiIdInput && document.activeElement !== upiIdInput) {
        upiIdInput.value = upiId;
      }
      if (settingsQrPreview && document.activeElement !== upiIdInput) {
        settingsQrPreview.src = buildQrUrl(upiId, 0, 180);
      }
      if (payModalUpi) {
        payModalUpi.textContent = upiId;
      }
      if (payModalLink) {
        const uri = buildUpiUri(upiId, amount);
        payModalLink.textContent = uri;
        payModalLink.href = uri;
      }
      if (payQrImage) {
        payQrImage.src = buildQrUrl(upiId, amount);
      }
    }





















    function printBill() {
      refreshCustomerStateFromInputs();
      if (!state.cart.length) {
        alert('Cart is empty.');
        return;
      }

      const gstEnabled = isGstEnabled();
      const lineItems = state.cart
        .map((cartItem) => {
          let product = state.items.find((it) => it.id === cartItem.itemId);
          if (!product && cartItem.isCustom) {
            product = {
              id: cartItem.itemId,
              name: cartItem.name,
              price: cartItem.customPrice,
              gstRate: cartItem.gstRate,
              brand: 'Manual',
            };
          }

          // Use custom price if available
          const effectiveProduct = { ...product, price: cartItem.customPrice ?? product?.price ?? 0 };

          const baseGstRate =
            typeof cartItem.gstRate === 'number'
              ? cartItem.gstRate
              : product?.gstRate ?? 0;
          return buildInvoiceLineItem({
            product: effectiveProduct,
            quantity: cartItem.quantity,
            gstRate: baseGstRate,
            gstEnabledOverride: gstEnabled,
          });
        })
        .filter(Boolean);

      if (!lineItems.length) {
        alert('No valid items to print.');
        return;
      }

      const totals = calculateTotalsFromLineItems(lineItems);
      const previewBill = generateBillNumber(
        new Date(),
        state.settings.billSeries ?? DEFAULT_SETTINGS.billSeries,
      );
      const invoiceModel = buildInvoiceModel({
        lineItems,
        totals,
        timestamp: new Date(),
        billNumber: previewBill,
        customer: getCustomerSnapshot(),
        gstEnabledOverride: gstEnabled,
        settings: state.settings,
      });

      printInvoice(invoiceModel);
    }

    // Draggable Cart Functions
    function setupDraggableCart() {
      const cart = document.getElementById('draggableCart');
      const header = document.getElementById('cartHeader');
      if (!cart || !header) return;

      // Ensure cart uses fixed positioning and doesn't use transforms that break calculations
      cart.style.position = 'fixed';
      cart.style.touchAction = 'none';

      let isDown = false;
      let offset = { x: 0, y: 0 };

      function getClient(e) {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
      }

      function startDrag(e) {
        const target = e.target || e.srcElement;
        if (target && target.closest && target.closest('button')) return; // don't drag when clicking buttons
        e.preventDefault();
        isDown = true;
        const rect = cart.getBoundingClientRect();
        const point = getClient(e);
        offset.x = point.x - rect.left;
        offset.y = point.y - rect.top;
        cart.style.cursor = 'grabbing';
      }

      function onMove(e) {
        if (!isDown) return;
        const point = getClient(e);
        let x = point.x - offset.x;
        let y = point.y - offset.y;

        // Clamp to viewport with small margin
        const margin = 8;
        const maxX = Math.max(margin, window.innerWidth - cart.offsetWidth - margin);
        const maxY = Math.max(margin, window.innerHeight - cart.offsetHeight - margin);
        x = Math.max(margin, Math.min(x, maxX));
        y = Math.max(margin, Math.min(y, maxY));

        cart.style.left = x + 'px';
        cart.style.top = y + 'px';
        cart.style.right = 'auto';
        cart.style.bottom = 'auto';
      }

      function endDrag() {
        isDown = false;
        cart.style.cursor = 'grab';
      }

      header.addEventListener('mousedown', startDrag);
      header.addEventListener('touchstart', startDrag, { passive: false });
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchend', endDrag);

      // Keep cart within viewport on resize
      window.addEventListener('resize', () => {
        const rect = cart.getBoundingClientRect();
        const margin = 8;
        const maxX = Math.max(margin, window.innerWidth - cart.offsetWidth - margin);
        const maxY = Math.max(margin, window.innerHeight - cart.offsetHeight - margin);
        let left = parseFloat(cart.style.left) || rect.left;
        let top = parseFloat(cart.style.top) || rect.top;
        left = Math.max(margin, Math.min(left, maxX));
        top = Math.max(margin, Math.min(top, maxY));
        cart.style.left = left + 'px';
        cart.style.top = top + 'px';
      });
    }

    // Ensure proper stacking when multiple Bootstrap modals are opened
    function setupModalStacking() {
      document.addEventListener('show.bs.modal', (e) => {
        // number of currently visible modals
        const openCount = document.querySelectorAll('.modal.show').length;
        const baseZ = 1050;
        const modal = e.target;
        const z = baseZ + (openCount * 20);
        modal.style.zIndex = z;
      });

      document.addEventListener('shown.bs.modal', (e) => {
        const modal = e.target;
        const backdrops = document.querySelectorAll('.modal-backdrop');
        const lastBackdrop = backdrops[backdrops.length - 1];
        if (lastBackdrop) {
          const modalZ = parseInt(modal.style.zIndex, 10) || 1050;
          lastBackdrop.style.zIndex = (modalZ - 10).toString();
        }
      });

      document.addEventListener('hidden.bs.modal', (e) => {
        // cleanup inline styles so future modals use defaults
        const modal = e.target;
        if (modal && modal.style) modal.style.zIndex = '';

        // cleanup any backdrops
        document.querySelectorAll('.modal-backdrop').forEach((b) => (b.style.zIndex = ''));

        // Force cleanup of modal-open class and scroll state
        setTimeout(() => {
          const visibleModals = document.querySelectorAll('.modal.show');
          if (visibleModals.length === 0) {
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
          }

          // Remove any lingering backdrops
          const backdrops = document.querySelectorAll('.modal-backdrop');
          if (backdrops.length > 0 && visibleModals.length === 0) {
            backdrops.forEach((bd) => bd.remove());
          }
        }, 0);
      });
    }

    // Cart resize support (vertical resize)
    function setupCartResizer() {
      const cart = document.getElementById('draggableCart');
      const resizer = document.getElementById('cartResizer');
      const content = document.getElementById('cartContent');
      if (!cart || !resizer || !content) return;

      let isResizing = false;
      let startY = 0;
      let startHeight = 0;

      function clampHeight(h) {
        const minH = 180; // minimal visible cart
        const maxH = Math.max(200, window.innerHeight - 120);
        return Math.max(minH, Math.min(h, maxH));
      }

      function onStart(e) {
        e.preventDefault();
        isResizing = true;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        startHeight = content.getBoundingClientRect().height;
        document.body.style.userSelect = 'none';
      }

      function onMove(e) {
        if (!isResizing) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dy = startY - clientY; // dragging up increases height
        const newH = clampHeight(startHeight + dy);
        content.style.maxHeight = newH + 'px';
        // persist
        try { localStorage.setItem('bb_cart_height', newH); } catch (err) { }
      }

      function onEnd() {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.userSelect = '';
      }

      resizer.addEventListener('mousedown', onStart);
      resizer.addEventListener('touchstart', onStart, { passive: false });
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);

      // Restore stored height if any
      try {
        const stored = parseInt(localStorage.getItem('bb_cart_height'), 10);
        if (stored && !isNaN(stored)) content.style.maxHeight = clampHeight(stored) + 'px';
      } catch (err) { }
    }

    function renderCategoriesInSettings() {
      const categoriesList = document.getElementById('categoriesList');
      if (!categoriesList) return;

      categoriesList.innerHTML = '';
      if (!state.categories.length) {
        categoriesList.innerHTML = '<div class="alert alert-info mb-0">No categories yet</div>';
        return;
      }

      state.categories.forEach((category) => {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        item.innerHTML = `
        <div>
          <h6 class="mb-1">${category.name}</h6>
          <small class="text-muted">${category.description || '(No description)'}</small>
        </div>
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-primary edit-category" data-id="${category.id}" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-danger delete-category" data-id="${category.id}" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;

        item.querySelector('.edit-category')?.addEventListener('click', () => {
          openCategoryModal(category);
        });

        item.querySelector('.delete-category')?.addEventListener('click', () => {
          if (confirm('Are you sure you want to delete this category?')) {
            deleteCategory(category.id);
          }
        });

        categoriesList.appendChild(item);
      });
    }

    function renderProductsInSettings() {
      const productsList = document.getElementById('productsList');
      if (!productsList) return;

      productsList.innerHTML = '';
      if (!state.items.length) {
        productsList.innerHTML = '<div class="alert alert-info mb-0">No products yet</div>';
        return;
      }

      state.items.forEach((product) => {
        const category = state.categories.find((c) => c.id === product.categoryId);
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        item.innerHTML = `
        <div style="flex: 1;">
          <h6 class="mb-1">${product.name}</h6>
          <small class="text-muted">
            ${product.brand ? product.brand + ' • ' : ''}₹${product.price.toFixed(2)} • ${category?.name || 'Uncategorized'
          }
          </small>
        </div>
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-primary edit-product" data-id="${product.id}" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-danger delete-product" data-id="${product.id}" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;

        item.querySelector('.edit-product')?.addEventListener('click', () => {
          openItemModal(product);
        });

        item.querySelector('.delete-product')?.addEventListener('click', () => {
          if (confirm('Are you sure you want to delete this product?')) {
            deleteItem(product.id);
          }
        });

        productsList.appendChild(item);
      });
    }

    document.addEventListener('DOMContentLoaded', init);
  })();
})();

