(function (global) {
    // Shared Invoice Logic

    const DEFAULT_SETTINGS = {
        shopName: 'Bright & Breeze Electricals',
        shopTagline: 'Lighting & Cooling Experts',
        shopAddress: '',
        shopContact: 'Phone: +91-90000 00000',
        upiId: 'brightbreeze@upi',
        gstEnabled: true,
        billSeries: 1,
    };

    function sanitizeFilename(name, fallback = 'invoice') {
        const safe = (name || fallback).toString().trim();
        return safe.replace(/[^a-z0-9-_\.]+/gi, '_') || fallback;
    }

    function generateBillNumber(timestamp = new Date(), series = 1) {
        const pad = (value, length = 2) => value.toString().padStart(length, '0');
        const year = timestamp.getFullYear();
        const month = pad(timestamp.getMonth() + 1);
        const day = pad(timestamp.getDate());
        const hours = pad(timestamp.getHours());
        const minutes = pad(timestamp.getMinutes());
        const seconds = pad(timestamp.getSeconds());
        const seriesPart = pad(series, 4);
        return `BILL${year}${month}${day}${hours}${minutes}${seconds}-${seriesPart}`;
    }

    function sanitizeGstRate(value) {
        const parsed =
            typeof value === 'number'
                ? value
                : typeof value === 'string'
                    ? parseFloat(value)
                    : 0;
        if (Number.isNaN(parsed) || parsed < 0) {
            return 0;
        }
        return Math.round(parsed * 100) / 100;
    }

    function roundCurrency(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
        }).format(amount);
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return value
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatGstRateLabel(rate) {
        const sanitized = sanitizeGstRate(rate);
        return Number.isInteger(sanitized)
            ? sanitized.toFixed(0)
            : sanitized.toString();
    }

    function buildInvoiceLineItem({
        product,
        quantity,
        gstRate,
        gstEnabledOverride,
        isGstEnabledFn, // Optional callback to check if GST is enabled globally
    }) {
        if (!quantity || quantity <= 0) {
            return null;
        }
        const unitPrice = product?.price ?? 0;
        const sanitizedRate = sanitizeGstRate(gstRate);
        const brand = typeof product?.brand === 'string' ? product.brand.trim() : '';

        // Determine if GST is enabled
        let gstEnabled = true;
        if (typeof gstEnabledOverride === 'boolean') {
            gstEnabled = gstEnabledOverride;
        } else if (typeof isGstEnabledFn === 'function') {
            gstEnabled = isGstEnabledFn();
        }

        const appliedRate = gstEnabled ? sanitizedRate : 0;
        const lineSubtotal = unitPrice * quantity;
        const gstAmount = lineSubtotal * (appliedRate / 100);

        return {
            id: product?.id ?? null,
            name: product?.name ?? 'Unknown Item',
            brand,
            quantity,
            price: unitPrice,
            gstRate: appliedRate,
            lineSubtotal: roundCurrency(lineSubtotal),
            gstAmount: roundCurrency(gstAmount),
            lineTotal: roundCurrency(lineSubtotal + gstAmount),
        };
    }

    function calculateTotalsFromLineItems(lineItems) {
        const sums = lineItems.reduce(
            (acc, item) => {
                acc.subtotal += item.lineSubtotal ?? item.price * item.quantity;
                acc.tax += item.gstAmount ?? 0;
                acc.total += item.lineTotal ?? item.lineSubtotal + (item.gstAmount ?? 0);
                return acc;
            },
            { subtotal: 0, tax: 0, total: 0 },
        );
        return {
            subtotal: roundCurrency(sums.subtotal),
            tax: roundCurrency(sums.tax),
            total: roundCurrency(sums.total),
        };
    }

    function buildInvoiceModel({
        lineItems,
        totals,
        timestamp = new Date(),
        billNumber = null,
        customer = null,
        gstEnabledOverride,
        settings = {}, // Pass settings explicitly
    }) {
        const gstEnabled =
            typeof gstEnabledOverride === 'boolean'
                ? gstEnabledOverride
                : (settings.gstEnabled ?? true);

        const {
            shopName,
            shopTagline,
            shopAddress,
            shopContact,
            gstNo,
        } = settings;

        return {
            shopName: shopName || DEFAULT_SETTINGS.shopName,
            shopTagline: shopTagline || '',
            shopAddress: shopAddress || '',
            shopContact: shopContact || '',
            gstNo: gstNo || '',
            gstEnabled,
            items: lineItems,
            totals,
            timestamp,
            billNumber,
            customer,
        };
    }

    function buildInvoiceFragments(model) {
        const {
            shopName,
            shopTagline,
            shopAddress,
            shopContact,
            gstNo,
            gstEnabled,
            items,
            totals,
            timestamp,
            billNumber,
            customer,
        } = model;

        // Ensure we have valid data
        const validItems = Array.isArray(items) ? items : [];
        const validTotals = totals || { subtotal: 0, tax: 0, total: 0 };

        const dateString = new Date(timestamp).toLocaleString();
        const addressHtml = shopAddress
            ? escapeHtml(shopAddress).replace(/\n/g, '<br />')
            : '';
        const contactHtml = escapeHtml(shopContact || '');
        const gstHtml = gstNo ? `GSTIN: ${escapeHtml(gstNo)}` : '';
        const taglineHtml = escapeHtml(shopTagline || '');
        const billHtml = billNumber ? escapeHtml(billNumber) : '';
        const customerName = escapeHtml(customer?.name || 'Walk-in Customer');
        const customerPhone = escapeHtml(customer?.phone || 'N/A');
        const customerHtml = `
      <div class="invoice-meta-row"><span class="label">Customer:</span><span>${customerName}</span></div>
      <div class="invoice-meta-row"><span class="label">Phone:</span><span>${customerPhone}</span></div>
    `;

        const tableHeader = gstEnabled
            ? `<tr>
            <th>Item</th>
            <th class="text-end">Qty</th>
            <th class="text-end">Rate (₹)</th>
            <th class="text-center">GST %</th>
            <th class="text-end">Line Total (₹)</th>
         </tr>`
            : `<tr>
            <th>Item</th>
            <th class="text-end">Qty</th>
            <th class="text-end">Rate (₹)</th>
            <th class="text-end">Line Total (₹)</th>
         </tr>`;

        const lineRows =
            validItems && validItems.length
                ? validItems
                    .map((item) => {
                        if (!item) return '';
                        const baseName = escapeHtml(item.name ?? 'Unknown Item');
                        const brandLabel = item.brand ? escapeHtml(item.brand) : '';
                        const name = brandLabel ? `${brandLabel} – ${baseName}` : baseName;
                        const qty = item.quantity ?? 0;
                        const price = (item.price ?? 0).toFixed(2);
                        const lineTotal = (item.lineTotal ?? 0).toFixed(2);

                        // Ensure text color is explicit
                        const rowStyle = 'color: #000000;';

                        if (gstEnabled) {
                            const gstRateDisplay = formatGstRateLabel(item.gstRate ?? 0);
                            const base = (item.lineSubtotal ?? 0).toFixed(2);
                            const gstAmount = (item.gstAmount ?? 0).toFixed(2);
                            return `<tr style="${rowStyle}">
                  <td>${name}</td>
                  <td class="text-end">${qty}</td>
                  <td class="text-end">${price}</td>
                  <td class="text-center">${gstRateDisplay}%</td>
                  <td class="text-end">${lineTotal}</td>
                </tr>
                <tr style="${rowStyle}">
                  <td colspan="4" class="small-text text-end" style="color: #555555;">
                    Base: ₹${base} | GST: ₹${gstAmount}
                  </td>
                  <td></td>
                </tr>`;
                        }
                        return `<tr style="${rowStyle}">
                <td>${name}</td>
                <td class="text-end">${qty}</td>
                <td class="text-end">${price}</td>
                <td class="text-end">${lineTotal}</td>
              </tr>`;
                    })
                    .filter(Boolean)
                    .join('')
                : `<tr><td colspan="${gstEnabled ? 5 : 4}" class="text-center text-muted">No items</td></tr>`;

        const subtotalLabel = gstEnabled ? 'Subtotal (ex GST)' : 'Subtotal';
        const subtotalFormatted = formatCurrency(validTotals.subtotal);
        const taxFormatted = formatCurrency(validTotals.tax);
        const totalFormatted = formatCurrency(validTotals.total);
        const summaryRows = [
            `<div class="summary-row"><span>${subtotalLabel}</span><span>${subtotalFormatted}</span></div>`,
            gstEnabled
                ? `<div class="summary-row"><span>GST Total</span><span>${taxFormatted}</span></div>`
                : '',
            `<div class="summary-row summary-row-total"><span>Grand Total</span><span>${totalFormatted}</span></div>`,
        ]
            .filter(Boolean)
            .join('');

        const tableFooter = `
      <tfoot>
        <tr class="subtotal-row">
          <td colspan="${gstEnabled ? 4 : 3}" class="text-end"><strong>${subtotalLabel}</strong></td>
          <td class="text-end"><strong>${subtotalFormatted}</strong></td>
        </tr>
        ${gstEnabled
                ? `<tr class="subtotal-row">
                 <td colspan="4" class="text-end"><strong>GST Total</strong></td>
                 <td class="text-end"><strong>${taxFormatted}</strong></td>
               </tr>`
                : ''
            }
        <tr class="subtotal-row grand-total-row">
          <td colspan="${gstEnabled ? 4 : 3}" class="text-end"><strong>Grand Total</strong></td>
          <td class="text-end"><strong>${totalFormatted}</strong></td>
        </tr>
      </tfoot>
    `;

        const styles = `
      @page { margin: 6mm 10mm 14mm 10mm; }
      html, body { background-color: #ffffff !important; color: #111111 !important; margin: 0; padding: 0; }
      body { margin: 0 !important; padding: 0 !important; }
      .invoice-wrapper { font-family: Arial, sans-serif; color: #111111; background-color: #fff; padding: 8px 18px 18px; }
      .invoice-header { text-align: center; margin-bottom: 10px; }
      .invoice-header h1 { margin-bottom: 4px; font-size: 22px; font-weight: bold; }
      .invoice-meta { margin-bottom: 10px; font-size: 12px; }
      .invoice-meta-row { display: flex; justify-content: space-between; margin-bottom: 3px; gap: 12px; }
      .invoice-meta-row .label { font-weight: 600; color: #444; }
      .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      .invoice-table th, .invoice-table td { border: 1px solid #bbb; padding: 6px; font-size: 12px; }
      .invoice-table th { background-color: #e8eef7; font-weight: 700; }
      .invoice-table tfoot td { font-weight: 700; background-color: #e8eef7; }
      .invoice-table tfoot .grand-total-row td { background-color: #1f6feb; color: #fff; font-weight: 700; font-size: 13px; }
      .text-end { text-align: right; }
      .text-center { text-align: center; }
      .small-text { font-size: 11px; color: #555; }
      .text-muted { color: #666; }
      .invoice-summary { border: 2px solid #1f6feb; border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
      .invoice-summary .summary-row { display: flex; justify-content: space-between; padding: 8px 12px; background-color: #f8f9fb; font-size: 12px; }
      .invoice-summary .summary-row:nth-child(odd) { background-color: #ffffff; }
      .invoice-summary .summary-row span:last-child { font-weight: 700; }
      .invoice-summary .summary-row-total { background: #1f6feb; color: #fff; font-size: 16px !important; padding: 12px !important; font-weight: 700; }
      .invoice-summary .summary-row-total span:last-child { font-weight: 700; font-size: 18px; }
      .invoice-footer { font-size: 11px; color: #555; text-align: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; }
    `;

        const content = `
      <div class="invoice-wrapper">
        <div class="invoice-header">
          <h1>${escapeHtml(shopName || DEFAULT_SETTINGS.shopName)}</h1>
          ${taglineHtml ? `<div class="small-text">${taglineHtml}</div>` : ''}
          ${addressHtml ? `<div class="small-text text-muted">${addressHtml}</div>` : ''}
          ${contactHtml ? `<div class="small-text">${contactHtml}</div>` : ''}
          ${gstHtml ? `<div class="small-text fw-bold mt-1">${gstHtml}</div>` : ''}
        </div>
        <div class="invoice-meta">
          ${billHtml ? `<div class="invoice-meta-row"><span class="label">Bill No:</span><span>${billHtml}</span></div>` : ''}
          <div class="invoice-meta-row"><span class="label">Date:</span><span>${escapeHtml(dateString)}</span></div>
          ${customerHtml}
        </div>
        <table class="invoice-table">
          <thead>${tableHeader}</thead>
          <tbody>${lineRows}</tbody>
          ${tableFooter}
        </table>
        <div class="invoice-summary">${summaryRows}</div>
        <div class="invoice-footer">Thank you for shopping with us!</div>
      </div>
    `;

        return { styles, content };
    }

    function renderInvoiceHtml(model, { wrapWithDocument = true } = {}) {
        const fragments = buildInvoiceFragments(model);
        if (wrapWithDocument) {
            return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Invoice - ${escapeHtml(
                model.shopName || DEFAULT_SETTINGS.shopName,
            )}</title><style>@page { margin: 6mm 10mm 14mm 10mm; }</style><style>${fragments.styles}</style></head><body style="background:#ffffff;color:#111111;margin:0;">${fragments.content}</body></html>`;
        }
        return `<style>${fragments.styles}</style>${fragments.content}`;
    }

    function printInvoice(invoiceModel, settings = {}) {
        // If settings are not passed in invoiceModel, try to use the second argument
        // But invoiceModel should ideally contain everything needed.
        // For compatibility with existing calls, we might need to merge.

        const filenameBase = sanitizeFilename(
            invoiceModel.billNumber || generateBillNumber(new Date(), settings.billSeries ?? 1),
            'invoice',
        );
        const filename = `${filenameBase}.pdf`;

        const html2pdfLib =
            typeof window.html2pdf === 'function'
                ? window.html2pdf
                : typeof window.html2pdf?.default === 'function'
                    ? window.html2pdf.default
                    : null;

        if (typeof html2pdfLib === 'function') {
            const container = document.createElement('div');
            container.className = 'invoice-export-container';
            container.style.position = 'fixed';
            container.style.left = '0';
            container.style.top = '0';
            container.style.width = '100%';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';
            container.innerHTML = renderInvoiceHtml(invoiceModel, { wrapWithDocument: false });
            document.body.appendChild(container);
            const target = container.querySelector('.invoice-wrapper') || container;
            container.style.backgroundColor = '#ffffff';
            container.style.color = '#111111';

            html2pdfLib()
                .set({
                    margin: [4, 10, 14, 10],
                    filename,
                    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                })
                .from(target)
                .save()
                .finally(() => {
                    document.body.removeChild(container);
                });
            return;
        }

        const invoiceWindow = window.open('', 'PRINT', 'height=700,width=900');
        if (!invoiceWindow) {
            alert('Enable pop-ups to print the bill.');
            return;
        }

        const htmlDocument = renderInvoiceHtml(invoiceModel, { wrapWithDocument: true });
        invoiceWindow.document.write(htmlDocument);
        invoiceWindow.document.close();

        const handlePrint = () => {
            try {
                invoiceWindow.focus();
                invoiceWindow.print();
            } catch (error) {
                console.warn('Unable to trigger print automatically', error);
            }
        };

        invoiceWindow.onafterprint = () => {
            try {
                invoiceWindow.close();
            } catch (error) {
                console.warn('Unable to close invoice window after print', error);
            }
        };

        if (invoiceWindow.document.readyState === 'complete') {
            handlePrint();
        } else {
            invoiceWindow.onload = handlePrint;
        }

        setTimeout(() => {
            try {
                invoiceWindow.close();
            } catch (error) {
                console.warn('Unable to close invoice window', error);
            }
        }, 3000);
    }

    // Expose to global scope
    global.InvoiceUtils = {
        sanitizeFilename,
        generateBillNumber,
        sanitizeGstRate,
        roundCurrency,
        formatCurrency,
        escapeHtml,
        formatGstRateLabel,
        buildInvoiceLineItem,
        calculateTotalsFromLineItems,
        buildInvoiceModel,
        buildInvoiceFragments,
        renderInvoiceHtml,
        printInvoice,
    };

})(window);
