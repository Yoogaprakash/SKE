(() => {
  const {
    formatCurrency,
    renderInvoiceHtml,
    printInvoice,
    generateBillNumber,
    buildInvoiceModel,
    calculateTotalsFromLineItems,
    sanitizeFilename
  } = window.InvoiceUtils;

  const STORAGE_KEYS = {
    categories: 'bb_electrical_categories',
    items: 'bb_electrical_items',
    sales: 'bb_electrical_sales',
    settings: 'bb_electrical_settings',
    session: 'bb_electrical_session',
  };

  const DEFAULT_SETTINGS = {
    shopName: 'Company',
    shopTagline: 'Shop',
    shopAddress: '',
    shopContact: 'Phone: +91-90000 00000',
    upiId: 'shop@upi',
    gstEnabled: true,
    billSeries: 1,
  };

  const state = {
    sales: [],
    categories: [],
    items: [],
    settings: {},
  };

  // DOM Elements
  const dailyTotalEl = document.getElementById('dailyTotal');
  const monthlyTotalEl = document.getElementById('monthlyTotal');
  const yearlyTotalEl = document.getElementById('yearlyTotal');
  const dailyCountEl = document.getElementById('dailyCount');
  const monthlyCountEl = document.getElementById('monthlyCount');
  const yearlyCountEl = document.getElementById('yearlyCount');
  const salesTableBody = document.getElementById('salesTableBody');
  const filteredTotalEl = document.getElementById('filteredTotal');
  const navShopNameEl = document.getElementById('navShopName');

  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');
  const filterByCategory = document.getElementById('filterByCategory');
  const filterByCustomer = document.getElementById('filterByCustomer');
  const filterByDescription = document.getElementById('filterByDescription');

  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');


  const viewBillModalEl = document.getElementById('viewBillModal');
  const billFrame = document.getElementById('billFrame');
  const downloadBillModalBtn = document.getElementById('downloadBillModalBtn');

  let viewBillModalInstance = null;
  let currentViewSale = null;

  function init() {
    if (!enforceAdminRole()) {
      return;
    }

    if (viewBillModalEl) {
      viewBillModalInstance = new bootstrap.Modal(viewBillModalEl);
    }

    loadData();
    renderSettings();

    // If a central store is active, listen for updates and merge them into the report view
    if (window.CentralStore) {
      document.addEventListener('central-data-updated', () => {
        loadData();
        renderSettings();
        renderSummary();
        renderTable();
      });

      document.addEventListener('central-sale-added', (e) => {
        try {
          const sale = e.detail;
          if (sale && sale.id) {
            state.sales.push(sale);
            renderSummary();
            renderTable();
          }
        } catch (err) {
          console.warn('Error handling central-sale-added', err);
        }
      });
    }

    populateCategoryFilter();
    renderSummary();
    renderTable();
    bindEvents();
  }

  function loadData() {
    state.sales = getStoredData(STORAGE_KEYS.sales, []);
    state.categories = getStoredData(STORAGE_KEYS.categories, []);
    state.items = getStoredData(STORAGE_KEYS.items, []);
    state.settings = getStoredData(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  }

  function renderSettings() {
    if (navShopNameEl && state.settings.shopName) {
      navShopNameEl.textContent = state.settings.shopName;
    }
  }

  function bindEvents() {
    filterDateFrom?.addEventListener('change', renderTable);
    filterDateTo?.addEventListener('change', renderTable);
    filterByCustomer?.addEventListener('input', renderTable);
    filterByDescription?.addEventListener('input', renderTable);
    filterByCategory?.addEventListener('change', renderTable);

    exportExcelBtn?.addEventListener('click', exportExcel);
    exportPdfBtn?.addEventListener('click', exportPdf);

    downloadBillModalBtn?.addEventListener('click', () => {
      if (currentViewSale) {
        downloadBill(currentViewSale);
      }
    });

    // Delegate click events for table actions
    salesTableBody?.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      const saleId = target.dataset.saleId;
      if (!saleId) return;

      const sale = state.sales.find(s => s.id === saleId);
      if (!sale) return;

      if (target.classList.contains('view-bill-btn')) {
        viewBill(sale);
      } else if (target.classList.contains('print-bill-btn')) {
        downloadBill(sale);
      } else if (target.classList.contains('delete-bill-btn')) {
        deleteSale(sale.id);
      }
    });

    // Listen for storage changes (e.g. data cleared in another tab)
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.sales) {
        loadData();
        renderSummary();
        renderTable();
      }
    });
  }

  function populateCategoryFilter() {
    if (!filterByCategory) return;
    state.categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      filterByCategory.appendChild(option);
    });
  }

  function renderSummary() {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const monthKey = now.toISOString().slice(0, 7);
    const yearKey = now.getFullYear().toString();

    const summary = state.sales.reduce(
      (acc, sale) => {
        const saleDate = new Date(sale.timestamp);
        const saleDay = saleDate.toISOString().slice(0, 10);
        const saleMonth = saleDate.toISOString().slice(0, 7);
        const saleYear = saleDate.getFullYear().toString();

        // Skip deleted sales
        if (sale.status === 2) return acc;

        if (saleDay === todayKey) {
          acc.daily.total += sale.total;
          acc.daily.count += 1;
        }
        if (saleMonth === monthKey) {
          acc.monthly.total += sale.total;
          acc.monthly.count += 1;
        }
        if (saleYear === yearKey) {
          acc.yearly.total += sale.total;
          acc.yearly.count += 1;
        }
        return acc;
      },
      {
        daily: { total: 0, count: 0 },
        monthly: { total: 0, count: 0 },
        yearly: { total: 0, count: 0 },
      },
    );

    dailyTotalEl.textContent = formatCurrency(summary.daily.total);
    monthlyTotalEl.textContent = formatCurrency(summary.monthly.total);
    yearlyTotalEl.textContent = formatCurrency(summary.yearly.total);
    dailyCountEl.textContent = `${summary.daily.count} orders`;
    monthlyCountEl.textContent = `${summary.monthly.count} orders`;
    yearlyCountEl.textContent = `${summary.yearly.count} orders`;
  }

  function getFilteredSales() {
    const dateFrom = filterDateFrom?.value;
    const dateTo = filterDateTo?.value;
    const selectedCategory = filterByCategory?.value;
    const customerQuery = filterByCustomer?.value?.trim().toLowerCase() ?? '';
    const descriptionQuery = filterByDescription?.value?.trim().toLowerCase() ?? '';

    return state.sales.filter((sale) => {
      const saleDate = sale.timestamp.slice(0, 10);

      if (dateFrom && saleDate < dateFrom) return false;
      if (dateTo && saleDate > dateTo) return false;

      if (customerQuery) {
        const customerName = (sale.customer?.name || '').toLowerCase();
        const customerPhone = (sale.customer?.phone || '').toLowerCase();
        if (!customerName.includes(customerQuery) && !customerPhone.includes(customerQuery)) {
          return false;
        }
      }

      if (descriptionQuery) {
        const hasItem = sale.items.some(item =>
          (item.name || '').toLowerCase().includes(descriptionQuery) ||
          (item.brand || '').toLowerCase().includes(descriptionQuery)
        );
        if (!hasItem) return false;
      }

      if (selectedCategory) {
        const hasCategory = sale.items.some((item) => {
          const itemCategoryId = resolveCategoryId(item.id);
          return itemCategoryId === selectedCategory;
        });
        if (!hasCategory) return false;
      }

      // Filter out deleted sales
      if (sale.status === 2) return false;

      return true;
    });
  }

  function getFilterSummary() {
    const filters = [];
    if (filterDateFrom?.value) filters.push(`From: ${filterDateFrom.value}`);
    if (filterDateTo?.value) filters.push(`To: ${filterDateTo.value}`);
    if (filterByCustomer?.value) filters.push(`Customer: ${filterByCustomer.value}`);
    if (filterByDescription?.value) filters.push(`Description: ${filterByDescription.value}`);
    if (filterByCategory?.value) {
      const catName = filterByCategory.options[filterByCategory.selectedIndex].text;
      filters.push(`Category: ${catName}`);
    }
    return filters.length ? filters.join(', ') : 'None';
  }

  function renderTable() {
    salesTableBody.innerHTML = '';

    if (!state.sales.length) {
      salesTableBody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">No sales recorded yet.</td></tr>';
      if (filteredTotalEl) filteredTotalEl.textContent = formatCurrency(0);
      return;
    }

    const filtered = getFilteredSales();
    const filteredTotal = filtered.reduce((sum, sale) => sum + sale.total, 0);
    if (filteredTotalEl) filteredTotalEl.textContent = formatCurrency(filteredTotal);

    if (!filtered.length) {
      salesTableBody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">No sales match the filter.</td></tr>';
      return;
    }

    filtered
      .sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .forEach((sale) => {
        const row = document.createElement('tr');

        const customerName = sale.customer?.name || 'Walk-in Customer';
        const customerPhone = sale.customer?.phone ? `<br><small class="text-muted">${sale.customer.phone}</small>` : '';

        row.innerHTML = `
          <td>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary view-bill-btn" data-sale-id="${sale.id}" title="View Bill">
                <i class="bi bi-eye"></i>
              </button>
              <button class="btn btn-outline-secondary print-bill-btn" data-sale-id="${sale.id}" title="Download PDF">
                <i class="bi bi-printer"></i>
              </button>
              <button class="btn btn-outline-danger delete-bill-btn" data-sale-id="${sale.id}" title="Delete Bill">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
          <td>${sale.billNumber || '-'}</td>
          <td>${new Date(sale.timestamp).toLocaleString()}</td>
          <td>${customerName}${customerPhone}</td>
          <td class="text-end fw-bold">${formatCurrency(sale.total)}</td>
        `;
        salesTableBody.appendChild(row);
      });
  }

  function resolveCategoryId(itemId) {
    return state.items.find((item) => item.id === itemId)?.categoryId ?? null;
  }

  function viewBill(sale) {
    currentViewSale = sale;
    const invoiceModel = buildInvoiceModel({
      lineItems: sale.items,
      totals: { subtotal: sale.subtotal, tax: sale.tax, total: sale.total },
      timestamp: new Date(sale.timestamp),
      billNumber: sale.billNumber,
      customer: sale.customer,
      gstEnabledOverride: sale.gstEnabled,
      settings: state.settings
    });

    const html = renderInvoiceHtml(invoiceModel, { wrapWithDocument: true });

    // Write to iframe
    const doc = billFrame.contentDocument || billFrame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    viewBillModalInstance?.show();
  }

  function downloadBill(sale) {
    const invoiceModel = buildInvoiceModel({
      lineItems: sale.items,
      totals: { subtotal: sale.subtotal, tax: sale.tax, total: sale.total },
      timestamp: new Date(sale.timestamp),
      billNumber: sale.billNumber,
      customer: sale.customer,
      gstEnabledOverride: sale.gstEnabled,
      settings: state.settings
    });

    printInvoice(invoiceModel, state.settings);
  }

  function deleteSale(saleId) {
    const sale = state.sales.find((s) => s.id === saleId);
    if (!sale) return;

    if (!confirm(`Delete bill #${sale.billNumber}? This action cannot be undone.`)) {
      return;
    }

    // Soft delete: set status to 2
    sale.status = 2;
    setStoredData(STORAGE_KEYS.sales, state.sales);

    // Refresh UI
    renderSummary();
    renderTable();
  }

  function exportExcel() {
    const filtered = getFilteredSales();
    if (!filtered.length) {
      alert('No data to export.');
      return;
    }

    const filterInfo = getFilterSummary();

    // Create data array
    const data = filtered.map(sale => ({
      'Bill No': sale.billNumber,
      'Date': new Date(sale.timestamp).toLocaleString(),
      'Customer Name': sale.customer?.name || 'Walk-in',
      'Customer Phone': sale.customer?.phone || '',
      'Subtotal': sale.subtotal,
      'GST': sale.tax,
      'Total': sale.total,
      'Items': sale.items.map(i => `${i.name} (x${i.quantity})`).join(', ')
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data, { origin: 'A2' });

    // Add filter info to cell A1
    XLSX.utils.sheet_add_aoa(ws, [[`Filters: ${filterInfo}`]], { origin: 'A1' });

    // Merge A1 across columns
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");

    const filename = `Sales_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  function exportPdf() {
    const filtered = getFilteredSales();
    if (!filtered.length) {
      alert('No data to export.');
      return;
    }

    const filterInfo = getFilterSummary();

    // Create a temporary table for PDF generation
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.innerHTML = `
      <h3>Sales Report</h3>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <p><strong>Filters Applied:</strong> ${filterInfo}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="border: 1px solid #ddd; padding: 8px;">Bill No</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Date</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Customer</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(sale => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">${sale.billNumber || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${new Date(sale.timestamp).toLocaleString()}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${sale.customer?.name || '-'}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(sale.total)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight: bold; background: #f0f0f0;">
            <td colspan="3" style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">
              ${formatCurrency(filtered.reduce((sum, s) => sum + s.total, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    `;

    const opt = {
      margin: 10,
      filename: `Sales_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container).save();
  }



  function getStoredData(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
      console.error('Failed to read storage', error);
      return fallback;
    }
  }

  function enforceAdminRole() {
    const session = getStoredData(STORAGE_KEYS.session, null);
    if (session?.authenticated && session?.activeRole === 'admin') {
      return true;
    }
    document.body.innerHTML = `
      <div class="container py-5 text-center">
        <div class="alert alert-warning d-inline-block text-start">
          <h4 class="alert-heading">Access Restricted</h4>
          <p class="mb-3">Reports are available only to Admin users.</p>
          <hr />
          <a class="btn btn-primary" href="index.html">Back to Billing</a>
        </div>
      </div>
    `;
    return false;
  }

  document.addEventListener('DOMContentLoaded', init);
})();

