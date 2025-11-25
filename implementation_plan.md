# Implementation Plan - Improve Sales Reports

## Goal Description
Improve the sales report functionality by adding "View" and "Print" icons to each row, allowing users to view the bill in an iframe or download it as a PDF. Enhance filtering options (From Date, To Date, Customer, Description) and allow downloading the filtered report as Excel or PDF.

## User Review Required
> [!IMPORTANT]
> I will be extracting the invoice generation logic from `app.js` into a new shared file `assets/js/invoice.js` to avoid code duplication and ensure consistency between the POS and Reports views.

## Proposed Changes

### Shared Logic
#### [NEW] [invoice.js](file:///d:/Shop code/assets/js/invoice.js)
- Create a new file to hold invoice generation and formatting logic.
- Move the following functions from `app.js`:
    - `sanitizeFilename`
    - `generateBillNumber`
    - `buildInvoiceLineItem`
    - `calculateTotalsFromLineItems`
    - `buildInvoiceModel`
    - `buildInvoiceFragments`
    - `renderInvoiceHtml`
    - `printInvoice` (refactored to be reusable)
    - `formatCurrency`
    - `escapeHtml`
    - `formatGstRateLabel`
    - `sanitizeGstRate`

### Main Application
#### [MODIFY] [app.js](file:///d:/Shop code/assets/js/app.js)
- Remove the functions moved to `invoice.js`.
- Ensure `app.js` uses the functions from the global scope (provided by `invoice.js`).

#### [MODIFY] [index.html](file:///d:/Shop code/index.html)
- Add `<script src="assets/js/invoice.js"></script>` before `app.js`.

### Reports Page
#### [MODIFY] [reports.html](file:///d:/Shop code/reports.html)
- Add `<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>`
- Add `<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>`
- Add `<script src="assets/js/invoice.js"></script>`
- Update the filter section:
    - Replace single Date input with "From Date" and "To Date".
    - Add "Description" input.
- Update the table headers:
    - Add "Actions" (Print/View icons).
    - Add "Bill No".
    - Remove "Items", "GST", "Net", "Category Split" (or consolidate/hide as requested "Bill no, date, Customer name, amount"). The user asked for "show print icon, view icon, Bill no, date, Customer name, amount". I will stick to these columns.
- Add a Modal for viewing the bill (iframe).

#### [MODIFY] [reports.js](file:///d:/Shop code/assets/js/reports.js)
- Update `renderTable` to match the new columns.
- Implement `viewBill(sale)`: Generate HTML using `renderInvoiceHtml` and show in the modal iframe.
- Implement `downloadBill(sale)`: Use `printInvoice` (or `html2pdf` directly) to download the specific bill.
- Implement `exportExcel`: Use `xlsx` library to export the filtered data.
- Implement `exportPdf`: Use `jspdf` (via `html2pdf` or similar) to export the report table.
- Update filtering logic to support date range and description search.

## Verification Plan

### Automated Tests
- None (Vanilla JS project).

### Manual Verification
1.  **POS Flow**: Verify that creating a sale and printing a bill in the main app still works (using the refactored `invoice.js`).
2.  **Reports Page**:
    - Check if the table shows the correct columns.
    - Test "View" icon: Should open a modal with the bill.
    - Test "Print" icon: Should download the bill PDF.
    - Test Filtering:
        - Filter by Date Range.
        - Filter by Customer.
        - Filter by Description (Item name).
    - Test Export:
        - Export to Excel.
        - Export to PDF (Report).
