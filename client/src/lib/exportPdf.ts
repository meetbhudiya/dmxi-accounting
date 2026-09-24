import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Invoice, ProfitAndLoss, BalanceSheet, CashFlow, TrialBalance, StatementLine } from "../api/types";
import { getPaperConfig } from "./paperSize";

// â"€â"€â"€ Colour palette (RGB tuples) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const PRIMARY:    [number,number,number] = [36,  84, 255];
const DARK:       [number,number,number] = [30,  41,  59];
const MUTED:      [number,number,number] = [100, 116, 139];
const BORDER:     [number,number,number] = [226, 232, 240];
const GREEN:      [number,number,number] = [22,  163,  74];
const RED:        [number,number,number] = [220,  38,  38];
const AMBER:      [number,number,number] = [217, 119,   6];
const LIGHTBLUE:  [number,number,number] = [232, 240, 254];
const WHITE:      [number,number,number] = [255, 255, 255];
const ALT_ROW:    [number,number,number] = [248, 250, 252];
const HDR_BG:     [number,number,number] = [241, 245, 249];

function money(v: string | number) {
  return Number(v).toLocaleString("en-KE", {
    style: "currency", currency: "KES", minimumFractionDigits: 2,
  });
}
function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-KE", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function statusColor(s: Invoice["status"]): [number,number,number] {
  if (s === "PAID")           return GREEN;
  if (s === "OVERDUE")        return RED;
  if (s === "PARTIALLY_PAID") return AMBER;
  return PRIMARY;
}

/** Build a styled invoice PDF; returns an ArrayBuffer. */
export function buildInvoicePdf(invoice: Invoice, companyName = "DMXI"): ArrayBuffer {
  const doc = new jsPDF(getPaperConfig("portrait"));
  const W  = doc.internal.pageSize.getWidth();
  const H  = doc.internal.pageSize.getHeight();
  const m  = 16;
  const rX = W - m;
  const PW = W - 2 * m;

  const BLUE:     [number,number,number] = [30, 100, 200];
  const BLUE_HDR: [number,number,number] = [25,  75, 160];
  const BLUE_LT:  [number,number,number] = [60, 130, 230];
  const ROW_ALT:  [number,number,number] = [219, 234, 254];
  const TBL_LINE: [number,number,number] = [180, 210, 240];

  // ── Header: split panel ──────────────────────────────────────────────────────
  const HDR    = 40;
  const splitX = Math.round(W * 0.44);

  // Left blue panel
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, splitX, HDR, "F");
  // Inner accent strip on left edge
  doc.setFillColor(...BLUE_LT);
  doc.rect(0, 0, 5, HDR, "F");
  // Decorative circle top-right corner of left panel
  doc.setFillColor(50, 120, 220);
  doc.circle(splitX, 0, 18, "F");

  // Company name on left panel (white)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text(companyName.toUpperCase(), 9, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(180, 215, 255);
  doc.text("TAX INVOICE", 9, 26);

  // Right panel: white background (default) with large INVOICE text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(...BLUE);
  doc.text("INVOICE", rX, HDR - 6, { align: "right" });

  // Thin top accent on right panel
  doc.setFillColor(...BLUE);
  doc.rect(splitX, 0, W - splitX, 3, "F");

  // Bottom border
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(1.2);
  doc.line(0, HDR, W, HDR);
  doc.setDrawColor(180, 210, 240);
  doc.setLineWidth(0.3);
  doc.line(0, HDR + 1.5, W, HDR + 1.5);

  // ── Bill To + Invoice Details ────────────────────────────────────────────────
  let y = HDR + 4;

  // "Invoice to :" label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Invoice to :", m, y);

  // Customer name
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(invoice.customer.name, m, y);

  // Contact details
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (invoice.customer.phone)   { doc.text(invoice.customer.phone,   m, y); y += 5; }
  if (invoice.customer.email)   { doc.text(invoice.customer.email,   m, y); y += 5; }
  if (invoice.customer.address) {
    const aLines = doc.splitTextToSize(invoice.customer.address, W / 2 - m - 8) as string[];
    doc.text(aLines, m, y);
    y += aLines.length * 5;
  }

  // Right column: invoice number + date
  const rightY = HDR + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(`Invoice no : ${invoice.number}`, rX, rightY, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(fmtDate(invoice.issueDate), rX, rightY + 6, { align: "right" });

  if (invoice.dueDate) {
    doc.text(`Due: ${fmtDate(invoice.dueDate)}`, rX, rightY + 12, { align: "right" });
  }
  if (invoice.reference) {
    doc.text(`Ref: ${invoice.reference}`, rX, rightY + 18, { align: "right" });
  }

  // Status badge (right side)
  const statusLabel = invoice.status.replace(/_/g, " ");
  const sColor = statusColor(invoice.status);
  doc.setFillColor(...sColor);
  const sBW = doc.getTextWidth(statusLabel) + 8;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.roundedRect(rX - sBW, rightY + 20, sBW, 7, 1.5, 1.5, "F");
  doc.setTextColor(...WHITE);
  doc.text(statusLabel, rX - sBW + 4, rightY + 25.5);

  y = Math.max(y, rightY + 32) + 6;

  // ── Items table ──────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: m, right: m },
    head: [["NO", "DESCRIPTION", "QTY", "PRICE", "TOTAL"]],
    body: invoice.items.map((item, i) => [
      String(i + 1),
      item.product && item.product !== item.description
        ? `${item.product}\n${item.description ?? ""}`
        : (item.description ?? ""),
      String(item.quantity),
      money(item.unitPrice),
      money(Number(item.quantity) * Number(item.unitPrice)),
    ]),
    headStyles: {
      fillColor: BLUE_HDR,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
      cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
    },
    bodyStyles: {
      fontSize: 9,
      textColor: DARK,
      cellPadding: { top: 1.5, bottom: 1.5, left: 4, right: 4 },
    },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: Math.round(PW * 0.08), halign: "center", textColor: MUTED },
      1: { cellWidth: "auto" },
      2: { cellWidth: Math.round(PW * 0.08), halign: "center" },
      3: { cellWidth: Math.round(PW * 0.18), halign: "right" },
      4: { cellWidth: Math.round(PW * 0.18), halign: "right", fontStyle: "bold" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 1) {
        const raw = data.cell.raw as string;
        if (raw.includes("\n")) data.cell.styles.fontStyle = "bold";
      }
    },
    tableLineColor: TBL_LINE,
    tableLineWidth: 0.15,
  });

  // ── Sub Total / Tax rows (right-aligned) ─────────────────────────────────────
  let ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  const labelX = W - m - 55;

  function totRow(label: string, val: string, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(label, labelX, ty, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(val, rX, ty, { align: "right" });
    ty += 5;
  }

  totRow("Sub Total :", money(invoice.subtotal));
  if (Number(invoice.discountAmount) > 0)
    totRow(`Discount (${invoice.discountPercent}%) :`, `- ${money(invoice.discountAmount)}`);
  if (Number(invoice.vatAmount) > 0)
    totRow(`Tax ${invoice.vatPercent}% :`, money(invoice.vatAmount));
  if (Number(invoice.amountPaid) > 0)
    totRow("Amount Paid :", money(invoice.amountPaid));

  ty += 3;

  // ── Grand Total badge (right-aligned) ────────────────────────────────────────
  const badgeH = 12;
  const gtW    = Math.round(PW * 0.52);
  const gtX    = rX - gtW;

  doc.setFillColor(...BLUE);
  doc.roundedRect(gtX, ty, gtW, badgeH, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...WHITE);
  doc.text("GRAND TOTAL :", gtX + 6, ty + 8);
  doc.setFontSize(10);
  doc.text(money(invoice.grandTotal), rX - 5, ty + 8, { align: "right" });

  ty += badgeH + 6;

  // Balance Due (if partial)
  if (Number(invoice.amountPaid) > 0 && Number(invoice.balanceDue) !== 0) {
    const bdColor: [number,number,number] = Number(invoice.balanceDue) > 0 ? RED : GREEN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...bdColor);
    doc.text(`Balance Due : ${money(invoice.balanceDue)}`, rX, ty, { align: "right" });
    ty += 6;
  }

  // ── Payments received ────────────────────────────────────────────────────────
  if (invoice.payments.length > 0) {
    ty += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("PAYMENTS RECEIVED", m, ty);
    ty += 4;

    autoTable(doc, {
      startY: ty,
      margin: { left: m, right: m },
      head: [["Date", "Method", "Amount"]],
      body: invoice.payments.map((p) => [fmtDate(p.date), p.method ?? "--", money(p.amount)]),
      headStyles: { fillColor: BLUE_HDR, textColor: WHITE, fontSize: 8, fontStyle: "bold", cellPadding: { top: 1.5, bottom: 1.5, left: 4, right: 4 } },
      bodyStyles: { fontSize: 8.5, textColor: DARK, cellPadding: { top: 1.5, bottom: 1.5, left: 4, right: 4 } },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: { 2: { halign: "right", fontStyle: "bold" } },
      tableLineColor: TBL_LINE,
      tableLineWidth: 0.15,
    });
    ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // ── Notes / Terms ─────────────────────────────────────────────────────────────
  if (invoice.notes) {
    ty += 4;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.line(m, ty, m + 55, ty);
    ty += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text("NARRATION", m, ty);
    ty += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(invoice.notes, PW * 0.55) as string[];
    doc.text(noteLines, m, ty);
  }

  // ── Footer bar ───────────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE);
  doc.rect(0, H - 12, W, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...WHITE);
  doc.text(`${companyName}   |   Invoice ${invoice.number}   |   Generated ${fmtDate(new Date())}`, W / 2, H - 4.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 215, 255);
  doc.text("Powered by DMXI", rX, H - 4.5, { align: "right" });

  return doc.output("arraybuffer");
}


/** Trigger a browser download of the invoice as PDF. */
export function downloadInvoicePdf(invoice: Invoice, companyName?: string) {
  const buffer = buildInvoicePdf(invoice, companyName);
  const blob   = new Blob([buffer], { type: "application/pdf" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href       = url;
  a.download   = `Invoice_${invoice.number}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// â"€â"€â"€ Report PDF helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const PURPLE:  [number,number,number] = [124,  58, 237];
const ORANGE:  [number,number,number] = [217, 119,   6];
const HDR_DARK:[number,number,number] = [15,  23,  42];

function triggerDownload(doc: jsPDF, filename: string) {
  const blob = new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function addPoweredByFooter(doc: jsPDF, generated = fmtDate(new Date())) {
  const totalPages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.line(14, H - 11, W - 14, H - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Generated ${generated}   *   Page ${i} of ${totalPages}`, 14, H - 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...PRIMARY);
    doc.text("Powered by DMXI", W - 14, H - 5, { align: "right" });
  }
}

function addReportHeader(doc: jsPDF, companyName: string, title: string, subtitle: string) {
  const W = doc.internal.pageSize.getWidth();
  // Dark header band
  doc.setFillColor(...HDR_DARK); doc.rect(0, 0, W, 28, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.setTextColor(...WHITE); doc.text(companyName, 14, 12);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184); doc.text(title, 14, 20);
  // Subtitle strip
  doc.setFillColor(...LIGHTBLUE); doc.rect(0, 28, W, 10, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "italic");
  doc.setTextColor(...MUTED); doc.text(subtitle, 14, 35);
  return 45; // y position after header
}

// â"€â"€â"€ Profit & Loss PDF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function exportPnlPdf(report: ProfitAndLoss, companyName = "DMXI") {
  const doc = new jsPDF(getPaperConfig("portrait"));
  const period = `${report.from ? fmtDate(report.from) : "All time"} -- ${report.to ? fmtDate(report.to) : "Today"}`;
  let y = addReportHeader(doc, companyName, "Profit & Loss Statement", period);

  // Summary chips
  const chips = [
    { label: "Total Revenue",  value: money(report.totalRevenue),  color: GREEN },
    { label: "Total Expenses", value: money(report.totalExpenses), color: RED },
    { label: "Net Income",     value: money(report.netIncome),     color: Number(report.netIncome) >= 0 ? GREEN : RED },
  ];
  const chipW = (doc.internal.pageSize.getWidth() - 28) / 3;
  chips.forEach((chip, i) => {
    const x = 14 + i * (chipW + 4);
    doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, chipW, 18, 2, 2, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(chip.label.toUpperCase(), x + 4, y + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...chip.color);
    doc.text(chip.value, x + 4, y + 14);
  });
  y += 24;

  const tableStyles = { fontSize: 9, cellPadding: 3 };
  const headStyles  = { fillColor: HDR_DARK as [number,number,number], textColor: WHITE, fontStyle: "bold" as const, fontSize: 9 };

  // Income table
  autoTable(doc, {
    startY: y, head: [["Code", "Account", "Amount"]],
    body: report.revenue.length
      ? report.revenue.map((r) => [r.code, r.name, money(r.amount)])
      : [["", "No revenue activity", ""]],
    foot: [["", "Total Revenue", money(report.totalRevenue)]],
    styles: tableStyles, headStyles,
    footStyles: { fillColor: [240, 253, 244], textColor: GREEN, fontStyle: "bold", fontSize: 9 },
    columnStyles: { 0: { cellWidth: 16 }, 2: { halign: "right", cellWidth: 36 } },
    alternateRowStyles: { fillColor: ALT_ROW },
    didDrawPage: () => {},
    margin: { left: 14, right: 14 },
    tableLineColor: BORDER, tableLineWidth: 0.1,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Expenses table
  autoTable(doc, {
    startY: y, head: [["Code", "Account", "Amount"]],
    body: report.expenses.length
      ? report.expenses.map((r) => [r.code, r.name, money(r.amount)])
      : [["", "No expense activity", ""]],
    foot: [["", "Total Expenses", money(report.totalExpenses)]],
    styles: tableStyles, headStyles: { ...headStyles, fillColor: [120, 53, 15] as [number,number,number] },
    footStyles: { fillColor: [255, 251, 235], textColor: ORANGE, fontStyle: "bold", fontSize: 9 },
    columnStyles: { 0: { cellWidth: 16 }, 2: { halign: "right", cellWidth: 36 } },
    alternateRowStyles: { fillColor: ALT_ROW },
    margin: { left: 14, right: 14 },
    tableLineColor: BORDER, tableLineWidth: 0.1,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Net income
  const net = Number(report.netIncome);
  doc.setFillColor(...(net >= 0 ? [209, 250, 229] as [number,number,number] : [254, 226, 226] as [number,number,number]));
  doc.roundedRect(14, y, doc.internal.pageSize.getWidth() - 28, 12, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(...(net >= 0 ? GREEN : RED));
  doc.text("Net Income", 18, y + 8);
  doc.text(money(report.netIncome), doc.internal.pageSize.getWidth() - 18, y + 8, { align: "right" });

  addPoweredByFooter(doc);
  triggerDownload(doc, `ProfitAndLoss_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// â"€â"€â"€ Balance Sheet PDF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function exportBalanceSheetPdf(report: BalanceSheet, companyName = "DMXI") {
  const doc = new jsPDF(getPaperConfig("portrait"));
  let y = addReportHeader(doc, companyName, "Balance Sheet", `As of ${fmtDate(report.asOf)}`);

  const tableStyles = { fontSize: 9, cellPadding: 3 };
  const headStyles  = { fillColor: HDR_DARK as [number,number,number], textColor: WHITE, fontStyle: "bold" as const, fontSize: 9 };
  const colStyles   = { 0: { cellWidth: 16 }, 2: { halign: "right" as const, cellWidth: 36 } };

  const addSection = (label: string, rows: { code: string; name: string; balance: string }[], total: string, fillColor: [number,number,number], _footColor: [number,number,number]) => {
    autoTable(doc, {
      startY: y, head: [[label, "", "Balance"]],
      body: rows.length ? rows.map((r) => [r.code, r.name, money(r.balance)]) : [["", "No accounts", ""]],
      foot: [["", `Total ${label}`, money(total)]],
      styles: tableStyles, headStyles: { ...headStyles, fillColor },
      footStyles: { fillColor: [fillColor[0], fillColor[1], fillColor[2], 0.1] as unknown as [number,number,number], textColor: fillColor, fontStyle: "bold", fontSize: 9 },
      columnStyles: colStyles, alternateRowStyles: { fillColor: ALT_ROW },
      margin: { left: 14, right: 14 }, tableLineColor: BORDER, tableLineWidth: 0.1,
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  };

  addSection("ASSETS",      report.assets,      report.totalAssets,      PRIMARY, PRIMARY);
  addSection("LIABILITIES", report.liabilities, report.totalLiabilities, RED, RED);
  addSection("EQUITY",      report.equity,      report.totalEquity,      PURPLE, PURPLE);

  // Retained earnings + grand total
  doc.setFontSize(9); doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED);
  const W = doc.internal.pageSize.getWidth();
  doc.text(`Retained Earnings: ${money(report.retainedEarnings)}`, W - 14, y, { align: "right" });
  y += 8;

  doc.setFillColor(...LIGHTBLUE); doc.roundedRect(14, y, W - 28, 12, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...PRIMARY);
  doc.text("Total Liabilities & Equity", 18, y + 8);
  doc.text(money(report.totalLiabilitiesAndEquity), W - 18, y + 8, { align: "right" });

  addPoweredByFooter(doc);
  triggerDownload(doc, `BalanceSheet_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// â"€â"€â"€ Cash Flow PDF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const CF_LABELS: Record<string, string> = {
  REVENUE: "Operating -- Revenue", EXPENSE: "Operating -- Expenses",
  ASSET: "Investing", LIABILITY: "Financing -- Liabilities",
  EQUITY: "Financing -- Equity", OTHER: "Other",
};

export function exportCashFlowPdf(report: CashFlow, companyName = "DMXI") {
  const doc = new jsPDF(getPaperConfig("portrait"));
  const period = `${report.from ? fmtDate(report.from) : "All time"} -- ${report.to ? fmtDate(report.to) : "Today"}`;
  const y = addReportHeader(doc, companyName, "Cash Flow Statement", period);

  const entries = Object.entries(report.byCategory);
  autoTable(doc, {
    startY: y,
    head: [["Category", "Net Change"]],
    body: entries.length
      ? entries.map(([cat, amt]) => [CF_LABELS[cat] ?? cat, money(amt)])
      : [["No cash activity in this period.", ""]],
    foot: [["Net Change in Cash", money(report.netChange)]],
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: HDR_DARK as [number,number,number], textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    footStyles: {
      fillColor: (Number(report.netChange) >= 0 ? [209, 250, 229] : [254, 226, 226]) as [number,number,number],
      textColor: Number(report.netChange) >= 0 ? GREEN : RED,
      fontStyle: "bold", fontSize: 10,
    },
    columnStyles: { 1: { halign: "right", cellWidth: 50 } },
    alternateRowStyles: { fillColor: ALT_ROW },
    margin: { left: 14, right: 14 },
    tableLineColor: BORDER, tableLineWidth: 0.1,
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const v = Object.values(report.byCategory)[data.row.index];
        data.cell.styles.textColor = v !== undefined && Number(v) >= 0 ? GREEN : RED;
      }
    },
  });

  addPoweredByFooter(doc);
  triggerDownload(doc, `CashFlow_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// â"€â"€â"€ Trial Balance PDF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function exportTrialBalancePdf(report: TrialBalance, companyName = "DMXI") {
  const doc = new jsPDF(getPaperConfig("portrait"));
  const y = addReportHeader(doc, companyName, "Trial Balance", `As of ${fmtDate(report.asOf)}`);

  autoTable(doc, {
    startY: y,
    head: [["Code", "Account Name", "Type", "Debit", "Credit"]],
    body: report.rows.map((r) => [
      r.code, r.name, r.type,
      Number(r.debit)  > 0 ? money(r.debit)  : "--",
      Number(r.credit) > 0 ? money(r.credit) : "--",
    ]),
    foot: [["", "GRAND TOTAL", "", money(report.grandDebit), money(report.grandCredit)]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: HDR_DARK as [number,number,number], textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    footStyles: {
      fillColor: (report.balanced ? [209, 250, 229] : [254, 226, 226]) as [number,number,number],
      textColor: report.balanced ? GREEN : RED,
      fontStyle: "bold", fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 14, fontStyle: "bold" },
      2: { cellWidth: 22 },
      3: { halign: "right", cellWidth: 34 },
      4: { halign: "right", cellWidth: 34 },
    },
    alternateRowStyles: { fillColor: ALT_ROW },
    margin: { left: 14, right: 14 },
    tableLineColor: BORDER, tableLineWidth: 0.1,
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...(report.balanced ? [209, 250, 229] as [number,number,number] : [254, 226, 226] as [number,number,number]));
  doc.roundedRect(14, finalY, W - 28, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(...(report.balanced ? GREEN : RED));
  const msg = report.balanced
    ? `OK: BALANCED -- S Debits = S Credits = ${money(report.grandDebit)}`
    : `(!) OUT OF BALANCE -- difference: ${money(Math.abs(Number(report.grandDebit) - Number(report.grandCredit)))}`;
  doc.text(msg, W / 2, finalY + 7, { align: "center" });

  addPoweredByFooter(doc);
  triggerDownload(doc, `TrialBalance_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// â"€â"€â"€ Quotation PDF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface QuoteItem { description: string; qty: number; unitPrice: number; }
interface QuoteForPdf {
  number: string; customer: string; issueDate: string; validUntil: string;
  status: string; items: QuoteItem[]; notes: string;
  vatPercent: number; vatAmount: number; subtotal: number; total: number;
}

export function downloadQuotePdf(quote: QuoteForPdf, companyName = "DMXI") {
  const doc = new jsPDF(getPaperConfig("portrait"));
  const W = doc.internal.pageSize.getWidth();
  const m = 16;

  // Header band
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text(companyName, m, 16);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("QUOTATION", m, 27);

  // Quote number top-right
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  const numW = doc.getTextWidth(quote.number);
  doc.text(quote.number, W - m - numW, 16);

  // Status badge
  const statusLabel = quote.status.replace(/_/g, " ");
  const badgeW = doc.getTextWidth(statusLabel) + 8;
  doc.setFillColor(...DARK);
  doc.roundedRect(W - m - badgeW, 19, badgeW, 8, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(statusLabel, W - m - badgeW + 4, 25);

  // Bill To + Quote Details
  let y = 48;
  doc.setTextColor(...DARK);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTE TO", m, y);
  doc.text("QUOTE DETAILS", W / 2, y);
  doc.setFont("helvetica", "normal");
  y += 5;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(quote.customer, m, y);

  // Right column details
  const lX = W / 2, vX = W / 2 + Math.round((W - 2 * m) * 0.2);
  const details: [string, string][] = [
    ["Issue Date:",  fmtDate(quote.issueDate)],
    ["Valid Until:", fmtDate(quote.validUntil)],
  ];
  const dY = 53;
  details.forEach(([label, val], i) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(label, lX, dY + i * 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.text(val, vX, dY + i * 5);
  });

  // Divider
  y = Math.max(y + 6, dY + details.length * 5 + 4);
  doc.setDrawColor(...BORDER);
  doc.line(m, y, W - m, y);
  y += 6;

  // Items table
  const subtotal = quote.subtotal > 0
    ? quote.subtotal
    : quote.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  autoTable(doc, {
    startY: y,
    margin: { left: m, right: m },
    head: [["#", "Description", "Qty", "Unit Price", "Amount"]],
    body: quote.items.map((it, i) => [
      String(i + 1),
      it.description,
      String(it.qty),
      money(it.unitPrice),
      money(it.qty * it.unitPrice),
    ]),
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { cellWidth: 8,  halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 16, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right", fontStyle: "bold" },
    },
    tableLineColor: BORDER,
    tableLineWidth: 0.2,
  });

  // Totals
  let ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const rX = W - m;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Subtotal:", m, ty);
  doc.setTextColor(...DARK);
  doc.text(money(subtotal), rX, ty, { align: "right" });
  ty += 5.5;

  if (quote.vatPercent > 0) {
    doc.setTextColor(...MUTED);
    doc.text(`VAT (${quote.vatPercent}%):`, m, ty);
    doc.setTextColor(...DARK);
    doc.text(money(quote.vatAmount), rX, ty, { align: "right" });
    ty += 5.5;
  }

  // Grand Total card
  doc.setDrawColor(...BORDER);
  doc.line(m, ty - 1, rX, ty - 1);
  ty += 3;

  const gtH = 16;
  doc.setFillColor(232, 240, 254);
  doc.roundedRect(m, ty, W - 2 * m, gtH, 3, 3, "F");
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(m, ty, 5, gtH, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("TOTAL AMOUNT", m + 10, ty + 5.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PRIMARY);
  doc.text(money(quote.total), rX - 5, ty + 12, { align: "right" });
  ty += gtH + 5;

  // Notes
  if (quote.notes) {
    ty += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Notes", m, ty);
    ty += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    const noteLines = doc.splitTextToSize(quote.notes, W - 2 * m);
    doc.text(noteLines as string[], m, ty);
  }

  // Footer
  const pH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...BORDER);
  doc.rect(0, pH - 14, W, 14, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`${companyName}   *   Generated ${fmtDate(new Date())}   *   ${quote.number}`, W / 2, pH - 7, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...PRIMARY);
  doc.text("Powered by DMXI", W / 2, pH - 2.5, { align: "center" });

  triggerDownload(doc, `Quotation_${quote.number}.pdf`);
}

// â"€â"€â"€ Stock Count PDF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export interface StockCountItemPdf {
  productName: string;
  brand:       string | null;
  unit:        string | null;
  systemQty:   number | string;
  countedQty:  number | string;
  variance:    number | string;
  unitPrice:   number | string;
}

export interface StockCountPdf {
  id:        string;
  countDate: string | Date;
  note:      string | null;
  createdBy: string;
  createdAt: string | Date;
  items:     StockCountItemPdf[];
}

export function downloadStockCountPdf(count: StockCountPdf, companyName = "DMXI") {
  const doc  = new jsPDF(getPaperConfig("landscape"));
  const W    = doc.internal.pageSize.getWidth();
  const m    = 14;

  // Header band
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...WHITE);
  doc.text("STOCK COUNT REPORT", m, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 215, 255);
  doc.text(companyName, m, 19);

  // Count date top-right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(fmtDate(count.countDate), W - m, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 215, 255);
  doc.text(`By: ${count.createdBy}   *   Recorded: ${fmtDate(count.createdAt)}`, W - m, 19, { align: "right" });

  let ty = 36;

  // Note
  if (count.note) {
    doc.setFillColor(...ALT_ROW);
    doc.roundedRect(m, ty - 4, W - 2 * m, 10, 2, 2, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Note: ${count.note}`, m + 4, ty + 2);
    ty += 14;
  }

  // KPI row
  const totalItems  = count.items.length;
  const adjusted    = count.items.filter((i) => Number(i.variance) !== 0).length;
  const netVariance = count.items.reduce((s, i) => s + Number(i.variance), 0);
  const totalValue  = count.items.reduce((s, i) => s + Number(i.countedQty) * Number(i.unitPrice), 0);

  const kpis = [
    { label: "Products Counted", value: String(totalItems) },
    { label: "Adjusted",         value: String(adjusted) },
    { label: "Net Variance",     value: (netVariance >= 0 ? "+" : "") + netVariance },
    { label: "Count Value",      value: money(totalValue) },
  ];
  const kW = (W - 2 * m - 12) / 4;
  kpis.forEach((k, i) => {
    const kx = m + i * (kW + 4);
    doc.setFillColor(...HDR_BG);
    doc.roundedRect(kx, ty - 4, kW, 16, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(k.label, kx + kW / 2, ty + 1, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(k.value, kx + kW / 2, ty + 8, { align: "center" });
  });
  ty += 22;

  // Items table
  autoTable(doc, {
    startY: ty,
    margin: { left: m, right: m },
    head: [["Product", "Brand", "Unit", "System Qty", "Counted", "Variance", "Unit Price", "Count Value"]],
    body: count.items.map((r) => {
      const v = Number(r.variance);
      return [
        r.productName,
        r.brand ?? "--",
        r.unit ?? "--",
        Number(r.systemQty),
        Number(r.countedQty),
        v === 0 ? "--" : (v > 0 ? "+" : "") + v,
        Number(r.unitPrice),
        Number(r.countedQty) * Number(r.unitPrice),
      ];
    }),
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
    bodyStyles: { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { cellWidth: "auto" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const raw = data.row.raw as (string | number)[];
        const txt = String(raw[5]);
        if (txt.startsWith("+")) data.cell.styles.textColor = [22, 163, 74];
        else if (txt !== "--") data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });

  // Footer
  const pH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...BORDER);
  doc.rect(0, pH - 12, W, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`${companyName}   *   Stock Count ${fmtDate(count.countDate)}   *   Generated ${fmtDate(new Date())}`, W / 2, pH - 4, { align: "center" });

  const dateStr = new Date(count.countDate).toISOString().slice(0, 10);
  triggerDownload(doc, `StockCount_${dateStr}.pdf`);
}

// â"€â"€â"€ Statement PDF â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export interface StatementExportMeta {
  title: string;
  subtitle?: string;
  debitHeader: string;
  creditHeader: string;
  balanceLabel: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  showVendor: boolean;
}

// Accent colors for type badges
const TYPE_COLORS: Record<string, [number,number,number]> = {
  Invoice:  PRIMARY,
  Payment:  GREEN,
  "Credit Note": AMBER,
  Expense:  [217, 70, 239],
  Purchase: [14, 165, 233],
};

function typeColor(type: string): [number,number,number] {
  for (const k of Object.keys(TYPE_COLORS)) {
    if (type.toLowerCase().includes(k.toLowerCase())) return TYPE_COLORS[k];
  }
  return MUTED;
}

export function downloadStatementPdf(
  lines: StatementLine[],
  meta: StatementExportMeta,
  companyName = "DMXI",
) {
  // Statements have many columns -- always landscape regardless of paper size preference
  const doc = new jsPDF(getPaperConfig("landscape"));
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const m   = 14;
  const PW  = W - 2 * m;  // printable width — all column widths derived from this

  // Column widths scale proportionally so any paper size fits without overflow
  const cDate    = Math.round(PW * 0.089);  // ~24mm on A4L
  const cVoucher = Math.round(PW * 0.104);  // ~28mm on A4L
  const cRef     = Math.round(PW * 0.104);  // ~28mm on A4L
  const cType    = Math.round(PW * 0.074);  // ~20mm on A4L
  const cVendor  = Math.round(PW * 0.112);  // ~30mm on A4L (when vendor column shown)
  const cNum     = Math.round(PW * 0.100);  // ~27mm on A4L (debit / credit)
  const cBal     = Math.round(PW * 0.112);  // ~30mm on A4L
  const tblFontB = PW < 190 ? 7   : 7.5;   // body font
  const tblFontH = PW < 190 ? 7   : 8;     // header font
  const cellPadV = PW < 190 ? 2.5 : 3.5;   // vertical cell padding

  const NAVY:  [number,number,number] = [10,  18,  42];
  const NAVY2: [number,number,number] = [18,  32,  70];
  const kpiAccent: [number,number,number][] = [
    PRIMARY,
    GREEN,
    meta.balance > 0 ? RED : meta.balance < 0 ? GREEN : MUTED,
  ];
  const balLabel = money(Math.abs(meta.balance)) + (meta.balance > 0 ? " DR" : meta.balance < 0 ? " CR" : "");

  // ── Header band ─────────────────────────────────────────────────────────────
  const HDR = 44;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, HDR, "F");
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, 5, HDR, "F");
  doc.setFillColor(...NAVY2);
  doc.rect(W - 72, 0, 72, HDR, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text(companyName, m + 8, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(meta.title.toUpperCase(), m + 8, 27);

  if (meta.subtitle) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 140, 200);
    doc.text(meta.subtitle, m + 8, 36);
  }

  // Right panel
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("GENERATED", W - 66, 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...WHITE);
  doc.text(fmtDate(new Date()), W - 66, 19);
  doc.setDrawColor(36, 84, 255);
  doc.setLineWidth(0.4);
  doc.line(W - 66, 22, W - m, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`${lines.length} transaction${lines.length !== 1 ? "s" : ""}`, W - 66, 29);

  // ── KPI tiles ────────────────────────────────────────────────────────────────
  let ty = HDR + 6;
  const kpiGap = 5;
  const kpiH   = 22;
  const kpiW   = (W - 2 * m - 2 * kpiGap) / 3;
  const kpiBg: [number,number,number][] = [
    [232, 240, 254],
    [240, 253, 244],
    meta.balance > 0 ? [254, 226, 226] : meta.balance < 0 ? [240, 253, 244] : [241, 245, 249],
  ];
  const kpis = [
    { label: meta.debitHeader  + " Total", value: money(meta.totalDebit)  },
    { label: meta.creditHeader + " Total", value: money(meta.totalCredit) },
    { label: meta.balanceLabel,            value: balLabel                 },
  ];
  kpis.forEach((k, i) => {
    const kx = m + i * (kpiW + kpiGap);
    doc.setFillColor(212, 220, 232);
    doc.roundedRect(kx + 0.5, ty + 0.5, kpiW, kpiH, 3, 3, "F");
    doc.setFillColor(...kpiBg[i]);
    doc.roundedRect(kx, ty, kpiW, kpiH, 3, 3, "F");
    doc.setFillColor(...kpiAccent[i]);
    doc.roundedRect(kx, ty, 3, kpiH, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(k.label.toUpperCase(), kx + 8, ty + 7.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...kpiAccent[i]);
    doc.text(k.value, kx + 8, ty + 17);
  });
  ty += kpiH + 6;

  // ── Transaction table ────────────────────────────────────────────────────────
  const head: string[] = ["Date", "Voucher No.", "Ref No.", "Type"];
  if (meta.showVendor) head.push("Vendor");
  head.push("Description", meta.debitHeader, meta.creditHeader, "Balance");

  const body = lines.map((l) => {
    const row: string[] = [fmtDate(l.date), l.voucherNo, l.reference ?? "--", l.type];
    if (meta.showVendor) row.push(l.vendor ?? "--");
    row.push(
      l.description,
      l.debit  > 0 ? money(l.debit)  : "--",
      l.credit > 0 ? money(l.credit) : "--",
      money(l.balance),
    );
    return row;
  });

  const numOff     = 4 + (meta.showVendor ? 1 : 0) + 1;
  const typeColIdx = 3;

  autoTable(doc, {
    startY: ty,
    margin: { left: m, right: m },
    head: [head],
    body,
    headStyles: {
      fillColor: NAVY as [number,number,number],
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: tblFontH,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: tblFontB,
      cellPadding: { top: cellPadV, bottom: cellPadV, left: 3, right: 3 },
      textColor: DARK,
    },
    alternateRowStyles: { fillColor: [246, 248, 252] as [number,number,number] },
    columnStyles: {
      0: { cellWidth: cDate },
      1: { cellWidth: cVoucher, fontStyle: "bold" },
      2: { cellWidth: cRef },
      3: { cellWidth: cType },
      ...(meta.showVendor ? { 4: { cellWidth: cVendor } } : {}),
      [numOff]:     { halign: "right", cellWidth: cNum },
      [numOff + 1]: { halign: "right", cellWidth: cNum },
      [numOff + 2]: { halign: "right", cellWidth: cBal, fontStyle: "bold" },
    },
    tableLineColor: [220, 228, 240] as [number,number,number],
    tableLineWidth: 0.15,

    didParseCell(data) {
      if (data.section === "body" && data.column.index === typeColIdx) {
        data.cell.styles.textColor = typeColor((data.row.raw as string[])[typeColIdx]);
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize  = 7;
      }
    },

    didDrawCell(data) {
      if (data.section !== "body") return;
      const line = lines[data.row.index];
      if (!line) return;
      if (data.column.index === numOff + 2) {
        const val = Number(line.balance);
        if (!isNaN(val) && val !== 0)
          data.cell.styles.textColor = val > 0 ? [220, 38, 38] : [22, 163, 74];
      }
      if (data.column.index === numOff     && Number(line.debit)  > 0) data.cell.styles.textColor = [220, 38, 38];
      if (data.column.index === numOff + 1 && Number(line.credit) > 0) data.cell.styles.textColor = [22, 163, 74];
    },
  });

  // ── Summary cards ────────────────────────────────────────────────────────────
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  if (finalY + 30 < H - 12) {
    const sy   = finalY + 5;
    const cGap = 5;
    const cW   = (W - 2 * m - 2 * cGap) / 3;
    const cH   = 20;
    const sumCards = [
      { label: meta.debitHeader  + " Total", value: money(meta.totalDebit),  bg: [232, 240, 254] as [number,number,number], fg: PRIMARY },
      { label: meta.creditHeader + " Total", value: money(meta.totalCredit), bg: [240, 253, 244] as [number,number,number], fg: GREEN   },
      {
        label: meta.balanceLabel, value: balLabel,
        bg: (meta.balance > 0 ? [254, 226, 226] : meta.balance < 0 ? [240, 253, 244] : [241, 245, 249]) as [number,number,number],
        fg: kpiAccent[2],
      },
    ];

    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.line(m, sy - 1, W - m, sy - 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("TOTALS", m, sy + 4);

    sumCards.forEach((c, i) => {
      const x = m + i * (cW + cGap);
      doc.setFillColor(210, 218, 232);
      doc.roundedRect(x + 0.5, sy + 7.5, cW, cH, 3, 3, "F");
      doc.setFillColor(...c.bg);
      doc.roundedRect(x, sy + 7, cW, cH, 3, 3, "F");
      doc.setFillColor(...c.fg);
      doc.roundedRect(x, sy + 7, 3, cH, 1.5, 1.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(c.label.toUpperCase(), x + 7, sy + 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...c.fg);
      doc.text(c.value, x + 7, sy + 23);
    });
  }

  // ── Per-page footer ──────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFillColor(...NAVY);
    doc.rect(0, H - 9, W, 9, "F");
    doc.setFillColor(...PRIMARY);
    doc.rect(0, H - 9, W, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`${companyName}  ·  ${meta.title}`, m, H - 3.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text(`Page ${pg} / ${totalPages}`, W / 2, H - 3.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Powered by DMXI", W - m, H - 3.5, { align: "right" });
  }

  const slug = meta.title.replace(/[^a-zA-Z0-9]+/g, "_");
  triggerDownload(doc, `Statement_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

