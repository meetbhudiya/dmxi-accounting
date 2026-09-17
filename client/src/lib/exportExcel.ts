import ExcelJS from "exceljs";
import type { JournalEntry, LedgerRow, Account, AccountType, ProfitAndLoss, BalanceSheet, CashFlow, TrialBalance, StatementLine } from "../api/types";

// ─── Color palette (ARGB: 8-char hex, alpha first) ───────────────────────────
const C = {
  HEADER_BG:    "FF1E293B",  // slate-800
  HEADER_FG:    "FFFFFFFF",  // white
  TITLE_FG:     "FF1E293B",
  ACCENT:       "FF2454FF",  // primary blue
  MUTED:        "FF64748B",  // slate-500
  ALT_ROW:      "FFF8FAFC",  // slate-50
  BORDER:       "FFE2E8F0",  // slate-200
  BORDER_DARK:  "FF94A3B8",  // slate-400
  GREEN:        "FF16A34A",
  GREEN_LIGHT:  "FFD1FAE5",
  RED:          "FFDC2626",
  AMBER:        "FFD97706",
  AMBER_LIGHT:  "FFFEF9C3",
  BLUE_LIGHT:   "FFE8F0FE",
  WHITE:        "FFFFFFFF",
  TOTAL_BG:     "FFDBEAFE",  // blue-100
};

const TYPE_CLR: Record<AccountType, { fg: string; bg: string }> = {
  ASSET:     { fg: "FF2454FF", bg: "FFE8EDFF" },
  LIABILITY: { fg: "FFDC2626", bg: "FFFEF2F2" },
  EQUITY:    { fg: "FF7C3AED", bg: "FFF5F3FF" },
  REVENUE:   { fg: "FF16A34A", bg: "FFF0FDF4" },
  EXPENSE:   { fg: "FFD97706", bg: "FFFEFCE8" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────


async function download(wb: ExcelJS.Workbook, filename: string) {
  const generated = new Date().toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

  wb.eachSheet((ws) => {
    // Print header/footer (shows when printing or printing to PDF)
    ws.headerFooter.oddFooter  = `&L&8Generated ${generated}&R&8Powered by DMXI&CPage &P of &N`;
    ws.headerFooter.evenFooter = `&L&8Generated ${generated}&R&8Powered by DMXI&CPage &P of &N`;

    // Visible branding row at the bottom of every sheet
    const lastRow = ws.lastRow?.number ?? 1;
    ws.addRow([]);  // spacer
    const brandRow = ws.addRow([`Powered by DMXI  ·  Generated ${generated}`]);
    brandRow.height = 18;
    const colCount = ws.columnCount || 6;
    ws.mergeCells(brandRow.number, 1, brandRow.number, colCount);
    const cell = brandRow.getCell(1);
    cell.font      = { bold: true, size: 9, color: { argb: C.ACCENT }, name: "Calibri", italic: true };
    cell.fill      = solid(C.BLUE_LIGHT);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border    = { top: { style: "thin", color: { argb: C.ACCENT } } };
    void lastRow; // suppress unused warning
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(argb = C.BORDER): ExcelJS.Borders {
  return {
    top:      { style: "thin", color: { argb } },
    bottom:   { style: "thin", color: { argb } },
    left:     { style: "thin", color: { argb } },
    right:    { style: "thin", color: { argb } },
    diagonal: { style: "thin", color: { argb } },
  };
}

function hairBorder(): ExcelJS.Borders {
  return {
    top:      { style: "hair", color: { argb: C.BORDER } },
    bottom:   { style: "hair", color: { argb: C.BORDER } },
    left:     { style: "hair", color: { argb: C.BORDER } },
    right:    { style: "hair", color: { argb: C.BORDER } },
    diagonal: { style: "hair", color: { argb: C.BORDER } },
  };
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-KE", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// Adds company name + report title + subtitle rows, returns next row index
function addReportHeader(
  ws: ExcelJS.Worksheet,
  colCount: number,
  companyName: string,
  reportTitle: string,
  subtitle: string
) {
  // Row 1 — Company name
  const r1 = ws.addRow([companyName]);
  r1.height = 32;
  ws.mergeCells(r1.number, 1, r1.number, colCount);
  const c1 = r1.getCell(1);
  c1.font   = { bold: true, size: 16, color: { argb: C.ACCENT }, name: "Calibri" };
  c1.fill   = solid(C.BLUE_LIGHT);
  c1.alignment = { horizontal: "left", vertical: "middle" };

  // Row 2 — Report title
  const r2 = ws.addRow([reportTitle]);
  r2.height = 24;
  ws.mergeCells(r2.number, 1, r2.number, colCount);
  const c2 = r2.getCell(1);
  c2.font   = { bold: true, size: 13, color: { argb: C.TITLE_FG }, name: "Calibri" };
  c2.fill   = solid(C.BLUE_LIGHT);
  c2.alignment = { horizontal: "left", vertical: "middle" };

  // Row 3 — Subtitle / period
  const r3 = ws.addRow([subtitle]);
  r3.height = 18;
  ws.mergeCells(r3.number, 1, r3.number, colCount);
  const c3 = r3.getCell(1);
  c3.font      = { italic: true, size: 10, color: { argb: C.MUTED }, name: "Calibri" };
  c3.fill      = solid(C.BLUE_LIGHT);
  c3.alignment = { horizontal: "left", vertical: "middle" };

  // Bottom border on header block
  c3.border = { bottom: { style: "medium", color: { argb: C.ACCENT } } };

  // Row 4 — blank spacer
  ws.addRow([]);
}

// Adds a dark header row; numeric cols are right-aligned
function addHeaderRow(
  ws: ExcelJS.Worksheet,
  labels: string[],
  numericCols: number[] = []
): ExcelJS.Row {
  const row = ws.addRow(labels);
  row.height = 26;
  labels.forEach((_, i) => {
    const cell = row.getCell(i + 1);
    cell.font   = { bold: true, size: 10, color: { argb: C.HEADER_FG }, name: "Calibri" };
    cell.fill   = solid(C.HEADER_BG);
    cell.border = {
      ...thinBorder(C.HEADER_BG),
      bottom: { style: "medium", color: { argb: C.ACCENT } },
    };
    cell.alignment = {
      horizontal: numericCols.includes(i + 1) ? "right" : "left",
      vertical: "middle",
    };
  });
  return row;
}

// Styles a data row with alternating color + borders + number formatting
function styleDataRow(
  row: ExcelJS.Row,
  colCount: number,
  isAlt: boolean,
  opts: { bold?: boolean; italic?: boolean; bg?: string; fg?: string } = {}
) {
  row.height = 18;
  const bg = opts.bg ?? (isAlt ? C.ALT_ROW : C.WHITE);
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill   = solid(bg);
    cell.border = hairBorder();
    cell.font = {
      size: 10, name: "Calibri",
      bold: opts.bold ?? false,
      italic: opts.italic ?? false,
      color: { argb: opts.fg ?? C.TITLE_FG },
    };
    if (typeof cell.value === "number") {
      cell.numFmt = '#,##0.00';
      cell.alignment = { horizontal: "right", vertical: "middle" };
    } else {
      cell.alignment = { vertical: "middle" };
    }
  }
}

// ─── Daybook Export ───────────────────────────────────────────────────────────

export async function exportDaybook(
  entries: JournalEntry[],
  period: { from: string; to: string },
  companyName = "DMXI"
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();

  const ws = wb.addWorksheet("Journal Daybook", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const COLS = 7;
  ws.columns = [
    { key: "date",    width: 14 },
    { key: "ref",     width: 18 },
    { key: "memo",    width: 44 },
    { key: "code",    width:  8 },
    { key: "account", width: 30 },
    { key: "debit",   width: 16 },
    { key: "credit",  width: 16 },
  ];

  addReportHeader(ws, COLS, companyName, "Journal Daybook",
    `Period: ${fmtDate(period.from)}  —  ${fmtDate(period.to)}`);

  const hdr = addHeaderRow(ws,
    ["Date", "Reference", "Narration / Memo", "Code", "Account Name", "Debit (Dr)", "Credit (Cr)"],
    [6, 7]
  );

  // Freeze pane below header
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: hdr.number, topLeftCell: `A${hdr.number + 1}` }];
  ws.autoFilter = { from: { row: hdr.number, column: 1 }, to: { row: hdr.number, column: COLS } };

  let rowIdx = 0;
  let totalDr = 0;
  let totalCr = 0;

  for (const entry of entries) {
    const drLines = entry.lines.filter((l) => Number(l.debit)  > 0);
    const crLines = entry.lines.filter((l) => Number(l.credit) > 0);
    const entryTotal = drLines.reduce((s, l) => s + Number(l.debit), 0);
    totalDr += entryTotal;
    totalCr += entryTotal;

    // Debit lines
    drLines.forEach((l, i) => {
      const row = ws.addRow([
        i === 0 ? fmtDate(entry.date) : null,
        i === 0 ? (entry.reference ?? "") : null,
        l.description ?? (i === 0 ? (entry.memo ?? "") : ""),
        l.account?.code ?? "",
        l.account?.name ?? l.accountId,
        Number(l.debit),
        null,
      ]);
      styleDataRow(row, COLS, rowIdx % 2 === 1);
      row.getCell(5).font = { bold: true, size: 10, name: "Calibri", color: { argb: C.TITLE_FG } };
      row.getCell(6).font = { bold: true, size: 10, name: "Calibri", color: { argb: C.GREEN } };
      rowIdx++;
    });

    // Credit lines (indented)
    crLines.forEach((l) => {
      const row = ws.addRow([
        null, null,
        l.description ?? "",
        l.account?.code ?? "",
        `    ${l.account?.name ?? l.accountId}`,
        null,
        Number(l.credit),
      ]);
      styleDataRow(row, COLS, rowIdx % 2 === 1, { fg: C.MUTED });
      row.getCell(7).font = { bold: true, size: 10, name: "Calibri", color: { argb: C.RED } };
      rowIdx++;
    });

    // Narration row
    const narRow = ws.addRow([null, null, `(${entry.memo ?? "No narration"})`, null, null, entryTotal, entryTotal]);
    styleDataRow(narRow, COLS, rowIdx % 2 === 1, { italic: true, fg: C.MUTED });
    narRow.getCell(6).font = { italic: true, size: 10, name: "Calibri", color: { argb: C.MUTED } };
    narRow.getCell(7).font = { italic: true, size: 10, name: "Calibri", color: { argb: C.MUTED } };
    // Thick bottom border to separate entries
    for (let c = 1; c <= COLS; c++) {
      const cell = narRow.getCell(c);
      cell.border = { ...hairBorder(), bottom: { style: "medium", color: { argb: C.BORDER_DARK } } };
    }
    rowIdx++;
  }

  // Totals row
  const totalRow = ws.addRow(["", "", "", "", "GRAND TOTAL", totalDr, totalCr]);
  totalRow.height = 24;
  styleDataRow(totalRow, COLS, false, { bold: true, bg: C.TOTAL_BG });
  totalRow.getCell(5).font = { bold: true, size: 11, name: "Calibri" };
  totalRow.getCell(6).font = { bold: true, size: 11, name: "Calibri", color: { argb: C.GREEN } };
  totalRow.getCell(7).font = { bold: true, size: 11, name: "Calibri", color: { argb: C.RED } };
  for (let c = 1; c <= COLS; c++) {
    totalRow.getCell(c).border = {
      top:    { style: "medium", color: { argb: C.BORDER_DARK } },
      bottom: { style: "medium", color: { argb: C.BORDER_DARK } },
      left:   { style: "hair",   color: { argb: C.BORDER } },
      right:  { style: "hair",   color: { argb: C.BORDER } },
    };
  }

  await download(wb, `Daybook_${period.from}_to_${period.to}.xlsx`);
}

// ─── Account Ledger Export ────────────────────────────────────────────────────

export async function exportAccountLedger(
  account: Account,
  periodRows: LedgerRow[],
  openingBalance: number,
  period: { from: string; to: string },
  companyName = "DMXI"
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();

  const isDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";
  const drCr = (bal: number) => isDebitNormal ? (bal >= 0 ? "Dr" : "Cr") : (bal >= 0 ? "Cr" : "Dr");
  const typeFg = TYPE_CLR[account.type]?.fg ?? C.ACCENT;
  const typeBg = TYPE_CLR[account.type]?.bg ?? C.BLUE_LIGHT;

  const COLS = 7;
  const ws = wb.addWorksheet("Account Ledger", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [
    { key: "date",   width: 14 },
    { key: "ref",    width: 20 },
    { key: "desc",   width: 42 },
    { key: "debit",  width: 16 },
    { key: "credit", width: 16 },
    { key: "bal",    width: 16 },
    { key: "drcr",   width:  7 },
  ];

  addReportHeader(ws, COLS, companyName,
    `Account Ledger — ${account.code} · ${account.name}`,
    `Type: ${account.type}   |   Period: ${fmtDate(period.from)}  —  ${fmtDate(period.to)}`);

  // Account type badge row
  const badgeRow = ws.addRow([`${account.code}  ·  ${account.name}  [${account.type}]  · Normal: ${isDebitNormal ? "Debit" : "Credit"}`]);
  badgeRow.height = 20;
  ws.mergeCells(badgeRow.number, 1, badgeRow.number, COLS);
  const badgeCell = badgeRow.getCell(1);
  badgeCell.font   = { bold: true, size: 11, color: { argb: typeFg }, name: "Calibri" };
  badgeCell.fill   = solid(typeBg);
  badgeCell.alignment = { horizontal: "left", vertical: "middle" };
  badgeCell.border = { bottom: { style: "thin", color: { argb: typeFg } } };

  ws.addRow([]); // spacer

  const hdr = addHeaderRow(ws,
    ["Date", "Reference", "Description", "Debit (Dr)", "Credit (Cr)", "Balance", "Dr/Cr"],
    [4, 5, 6]
  );
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: hdr.number, topLeftCell: `A${hdr.number + 1}` }];

  // Opening balance row
  const obBal = Math.abs(openingBalance);
  const obRow = ws.addRow(["Opening Balance", "", "", undefined, undefined, obBal > 0 ? obBal : 0, drCr(openingBalance)]);
  obRow.height = 20;
  styleDataRow(obRow, COLS, false, { bold: true, bg: C.AMBER_LIGHT });
  obRow.getCell(6).numFmt = '#,##0.00';
  obRow.getCell(6).alignment = { horizontal: "right", vertical: "middle" };
  for (let c = 1; c <= COLS; c++) {
    obRow.getCell(c).border = {
      ...hairBorder(),
      top: { style: "medium", color: { argb: C.BORDER_DARK } },
    };
  }

  // Period data rows
  periodRows.forEach((r, idx) => {
    const bal = Number(r.balance);
    const side = drCr(bal);
    const row = ws.addRow([
      fmtDate(r.date),
      r.reference ?? "",
      r.description ?? r.memo ?? "",
      Number(r.debit)  > 0 ? Number(r.debit)  : undefined,
      Number(r.credit) > 0 ? Number(r.credit) : undefined,
      Math.abs(bal),
      side,
    ]);
    styleDataRow(row, COLS, idx % 2 === 1);
    if (Number(r.debit)  > 0) row.getCell(4).font = { bold: true, size: 10, name: "Calibri", color: { argb: C.GREEN } };
    if (Number(r.credit) > 0) row.getCell(5).font = { bold: true, size: 10, name: "Calibri", color: { argb: C.RED } };
    row.getCell(7).font = {
      bold: true, size: 10, name: "Calibri",
      color: { argb: side === "Dr" ? C.ACCENT : C.RED },
    };
    row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
  });

  // No-data message
  if (periodRows.length === 0) {
    const noRow = ws.addRow(["No transactions in this date range."]);
    ws.mergeCells(noRow.number, 1, noRow.number, COLS);
    noRow.getCell(1).font = { italic: true, color: { argb: C.MUTED }, size: 10, name: "Calibri" };
    noRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  }

  // Closing balance row
  const cbBal = periodRows.length > 0 ? Number(periodRows[periodRows.length - 1].balance) : openingBalance;
  const cbRow = ws.addRow([
    "Closing Balance", "", "", undefined, undefined, Math.abs(cbBal), drCr(cbBal),
  ]);
  cbRow.height = 22;
  styleDataRow(cbRow, COLS, false, { bold: true, bg: C.GREEN_LIGHT });
  cbRow.getCell(6).numFmt = '#,##0.00';
  cbRow.getCell(6).font = { bold: true, size: 11, name: "Calibri", color: { argb: C.GREEN } };
  cbRow.getCell(7).font = {
    bold: true, size: 11, name: "Calibri",
    color: { argb: drCr(cbBal) === "Dr" ? C.ACCENT : C.RED },
  };
  cbRow.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= COLS; c++) {
    cbRow.getCell(c).border = {
      ...hairBorder(),
      top: { style: "medium", color: { argb: C.BORDER_DARK } },
      bottom: { style: "medium", color: { argb: C.GREEN } },
    };
  }

  const safeName = account.name.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
  await download(wb, `Ledger_${account.code}_${safeName}_${period.from}_to_${period.to}.xlsx`);
}

// ─── Chart of Accounts Export ─────────────────────────────────────────────────

export async function exportChartOfAccounts(accounts: Account[], companyName = "DMXI") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();

  const COLS = 5;
  const ws = wb.addWorksheet("Chart of Accounts");
  ws.columns = [
    { key: "code",    width: 10 },
    { key: "name",    width: 36 },
    { key: "type",    width: 14 },
    { key: "normal",  width: 16 },
    { key: "status",  width: 12 },
  ];

  addReportHeader(ws, COLS, companyName, "Chart of Accounts",
    `Generated: ${fmtDate(new Date())}`);

  const ORDER: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

  for (const type of ORDER) {
    const group = accounts.filter((a) => a.type === type);
    if (!group.length) continue;

    const { fg, bg } = TYPE_CLR[type];

    // Type section header
    const secRow = ws.addRow([`${type}S`, "", "", "", ""]);
    secRow.height = 22;
    ws.mergeCells(secRow.number, 1, secRow.number, COLS);
    const secCell = secRow.getCell(1);
    secCell.font   = { bold: true, size: 11, color: { argb: fg }, name: "Calibri" };
    secCell.fill   = solid(bg);
    secCell.alignment = { horizontal: "left", vertical: "middle" };
    secCell.border = {
      top:    { style: "medium", color: { argb: fg } },
      bottom: { style: "thin",   color: { argb: fg } },
      left:   { style: "medium", color: { argb: fg } },
      right:  { style: "medium", color: { argb: fg } },
    };

    // Column headers for this section
    const hdrRow = ws.addRow(["Code", "Account Name", "Type", "Normal Balance", "Status"]);
    hdrRow.height = 20;
    for (let c = 1; c <= COLS; c++) {
      const cell = hdrRow.getCell(c);
      cell.font   = { bold: true, size: 9, color: { argb: fg }, name: "Calibri" };
      cell.fill   = solid(bg);
      cell.border = thinBorder(fg + "44");
      cell.alignment = { horizontal: c >= 4 ? "center" : "left", vertical: "middle" };
    }

    // Data rows
    group.forEach((a, idx) => {
      const row = ws.addRow([
        a.code,
        a.name,
        a.type,
        a.type === "ASSET" || a.type === "EXPENSE" ? "Debit" : "Credit",
        a.isActive ? "Active" : "Inactive",
      ]);
      row.height = 18;
      const isAlt = idx % 2 === 1;
      for (let c = 1; c <= COLS; c++) {
        const cell = row.getCell(c);
        cell.fill   = solid(isAlt ? bg + "55" : C.WHITE);
        cell.border = hairBorder();
        cell.font   = { size: 10, name: "Calibri" };
        cell.alignment = { vertical: "middle" };
      }
      // Code cell — colored + bold
      const codeCell = row.getCell(1);
      codeCell.font = { bold: true, size: 10, name: "Calibri", color: { argb: fg } };
      // Status cell — centered
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
      const statusCell = row.getCell(5);
      statusCell.font = {
        size: 10, name: "Calibri",
        color: { argb: a.isActive ? C.GREEN : C.MUTED },
        bold: a.isActive,
      };
    });

    // Spacer row between sections
    ws.addRow([]);
  }

  await download(wb, `Chart_of_Accounts_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Profit & Loss Export ─────────────────────────────────────────────────────

export async function exportPnlExcel(report: ProfitAndLoss, companyName = "DMXI") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();
  const COLS = 3;
  const ws = wb.addWorksheet("Profit & Loss");
  ws.columns = [{ key: "code", width: 10 }, { key: "name", width: 40 }, { key: "amount", width: 18 }];

  const period = `${report.from ? fmtDate(report.from) : "All time"} → ${report.to ? fmtDate(report.to) : "Today"}`;
  addReportHeader(ws, COLS, companyName, "Profit & Loss Statement", period);
  addHeaderRow(ws, ["Code", "Account", "Amount"], [3]);

  const addSection = (label: string, rows: { code: string; name: string; amount: string }[], fg: string, bg: string) => {
    const sec = ws.addRow([label, "", ""]);
    sec.height = 22;
    ws.mergeCells(sec.number, 1, sec.number, COLS);
    const cell = sec.getCell(1);
    cell.font = { bold: true, size: 11, color: { argb: fg }, name: "Calibri" };
    cell.fill = solid(bg);
    cell.alignment = { horizontal: "left", vertical: "middle" };

    let total = 0;
    rows.forEach((r, i) => {
      const row = ws.addRow([r.code, r.name, parseFloat(r.amount)]);
      styleDataRow(row, COLS, i % 2 === 1);
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
      total += parseFloat(r.amount);
    });
    if (rows.length === 0) {
      const e = ws.addRow(["", "No activity", ""]);
      styleDataRow(e, COLS, false, { italic: true, fg: C.MUTED });
    }
    const tot = ws.addRow(["", `Total ${label}`, total]);
    tot.height = 20;
    for (let c = 1; c <= COLS; c++) {
      const cell = tot.getCell(c);
      cell.fill = solid(bg);
      cell.font = { bold: true, size: 10, color: { argb: fg }, name: "Calibri" };
      cell.border = { top: { style: "thin", color: { argb: fg } }, bottom: { style: "medium", color: { argb: fg } } };
      if (c === 3) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: "right", vertical: "middle" }; }
    }
    ws.addRow([]);
    return total;
  };

  addSection("Income",   report.revenue,  "FF16A34A", "FFF0FDF4");
  addSection("Expenses", report.expenses, "FFD97706", "FFFEFCE8");

  const net = parseFloat(report.netIncome);
  const netRow = ws.addRow(["", "NET INCOME", net]);
  netRow.height = 26;
  for (let c = 1; c <= COLS; c++) {
    const cell = netRow.getCell(c);
    cell.fill = solid(net >= 0 ? "FFD1FAE5" : "FFFEE2E2");
    cell.font = { bold: true, size: 12, color: { argb: net >= 0 ? C.GREEN : C.RED }, name: "Calibri" };
    cell.border = { top: { style: "medium", color: { argb: net >= 0 ? C.GREEN : C.RED } }, bottom: { style: "medium", color: { argb: net >= 0 ? C.GREEN : C.RED } } };
    if (c === 3) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: "right", vertical: "middle" }; }
  }

  await download(wb, `ProfitAndLoss_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Balance Sheet Export ─────────────────────────────────────────────────────

export async function exportBalanceSheetExcel(report: BalanceSheet, companyName = "DMXI") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();
  const COLS = 3;
  const ws = wb.addWorksheet("Balance Sheet");
  ws.columns = [{ key: "code", width: 10 }, { key: "name", width: 40 }, { key: "balance", width: 18 }];

  addReportHeader(ws, COLS, companyName, "Balance Sheet", `As of ${fmtDate(report.asOf)}`);
  addHeaderRow(ws, ["Code", "Account", "Balance"], [3]);

  const addSection = (label: string, rows: { code: string; name: string; balance: string }[], fg: string, bg: string, total: string) => {
    const sec = ws.addRow([label, "", ""]);
    ws.mergeCells(sec.number, 1, sec.number, COLS);
    const cell = sec.getCell(1);
    cell.font = { bold: true, size: 11, color: { argb: fg }, name: "Calibri" };
    cell.fill = solid(bg);
    cell.alignment = { horizontal: "left", vertical: "middle" };
    sec.height = 22;

    rows.forEach((r, i) => {
      const row = ws.addRow([r.code, r.name, parseFloat(r.balance)]);
      styleDataRow(row, COLS, i % 2 === 1);
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
    });
    if (rows.length === 0) {
      const e = ws.addRow(["", "No accounts", ""]); styleDataRow(e, COLS, false, { italic: true, fg: C.MUTED });
    }
    const tot = ws.addRow(["", `Total ${label}`, parseFloat(total)]);
    tot.height = 20;
    for (let c = 1; c <= COLS; c++) {
      const cell = tot.getCell(c);
      cell.fill = solid(bg); cell.font = { bold: true, size: 10, color: { argb: fg }, name: "Calibri" };
      cell.border = { top: { style: "thin", color: { argb: fg } }, bottom: { style: "medium", color: { argb: fg } } };
      if (c === 3) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: "right", vertical: "middle" }; }
    }
    ws.addRow([]);
  };

  addSection("Assets",      report.assets,      "FF2454FF", "FFE8EDFF", report.totalAssets);
  addSection("Liabilities", report.liabilities, "FFDC2626", "FFFEF2F2", report.totalLiabilities);
  addSection("Equity",      report.equity,      "FF7C3AED", "FFF5F3FF", report.totalEquity);

  // Retained earnings line
  const re = ws.addRow(["", "Retained Earnings (net income to date)", parseFloat(report.retainedEarnings)]);
  styleDataRow(re, COLS, false, { italic: true, fg: C.MUTED });
  re.getCell(3).numFmt = '#,##0.00'; re.getCell(3).alignment = { horizontal: "right", vertical: "middle" };

  ws.addRow([]);
  const totRow = ws.addRow(["", "TOTAL LIABILITIES & EQUITY", parseFloat(report.totalLiabilitiesAndEquity)]);
  totRow.height = 26;
  for (let c = 1; c <= COLS; c++) {
    const cell = totRow.getCell(c);
    cell.fill = solid(C.TOTAL_BG); cell.font = { bold: true, size: 12, color: { argb: C.ACCENT }, name: "Calibri" };
    cell.border = { top: { style: "medium", color: { argb: C.ACCENT } }, bottom: { style: "medium", color: { argb: C.ACCENT } } };
    if (c === 3) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: "right", vertical: "middle" }; }
  }

  await download(wb, `BalanceSheet_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Cash Flow Export ─────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  REVENUE: "Operating — Revenue", EXPENSE: "Operating — Expenses",
  ASSET: "Investing", LIABILITY: "Financing — Liabilities",
  EQUITY: "Financing — Equity", OTHER: "Other",
};

export async function exportCashFlowExcel(report: CashFlow, companyName = "DMXI") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();
  const COLS = 2;
  const ws = wb.addWorksheet("Cash Flow");
  ws.columns = [{ key: "category", width: 42 }, { key: "amount", width: 20 }];

  const period = `${report.from ? fmtDate(report.from) : "All time"} → ${report.to ? fmtDate(report.to) : "Today"}`;
  addReportHeader(ws, COLS, companyName, "Cash Flow Statement", period);
  addHeaderRow(ws, ["Category", "Net Change"], [2]);

  const entries = Object.entries(report.byCategory);
  if (entries.length === 0) {
    const e = ws.addRow(["No cash activity in this period.", ""]); styleDataRow(e, COLS, false, { italic: true, fg: C.MUTED });
  } else {
    entries.forEach(([cat, amt], i) => {
      const v = parseFloat(amt);
      const row = ws.addRow([CATEGORY_LABEL[cat] ?? cat, v]);
      styleDataRow(row, COLS, i % 2 === 1);
      row.getCell(2).numFmt = '#,##0.00';
      row.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
      row.getCell(2).font = { size: 10, name: "Calibri", bold: true, color: { argb: v >= 0 ? C.GREEN : C.RED } };
    });
  }

  ws.addRow([]);
  const net = parseFloat(report.netChange);
  const netRow = ws.addRow(["NET CHANGE IN CASH", net]);
  netRow.height = 26;
  for (let c = 1; c <= COLS; c++) {
    const cell = netRow.getCell(c);
    cell.fill = solid(net >= 0 ? "FFD1FAE5" : "FFFEE2E2");
    cell.font = { bold: true, size: 12, color: { argb: net >= 0 ? C.GREEN : C.RED }, name: "Calibri" };
    cell.border = { top: { style: "medium", color: { argb: net >= 0 ? C.GREEN : C.RED } }, bottom: { style: "medium", color: { argb: net >= 0 ? C.GREEN : C.RED } } };
    if (c === 2) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: "right", vertical: "middle" }; }
  }

  await download(wb, `CashFlow_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Trial Balance Export ─────────────────────────────────────────────────────

export async function exportTrialBalanceExcel(report: TrialBalance, companyName = "DMXI") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();
  const COLS = 5;
  const ws = wb.addWorksheet("Trial Balance");
  ws.columns = [
    { key: "code",   width: 10 },
    { key: "name",   width: 36 },
    { key: "type",   width: 14 },
    { key: "debit",  width: 18 },
    { key: "credit", width: 18 },
  ];

  addReportHeader(ws, COLS, companyName, "Trial Balance", `As of ${fmtDate(report.asOf)}`);
  addHeaderRow(ws, ["Code", "Account Name", "Type", "Debit", "Credit"], [4, 5]);

  report.rows.forEach((r, i) => {
    const { fg } = TYPE_CLR[r.type as AccountType] ?? { fg: C.MUTED };
    const dr = parseFloat(r.debit);
    const cr = parseFloat(r.credit);
    const row = ws.addRow([r.code, r.name, r.type, dr > 0 ? dr : null, cr > 0 ? cr : null]);
    styleDataRow(row, COLS, i % 2 === 1);
    row.getCell(1).font = { bold: true, size: 10, name: "Calibri", color: { argb: fg } };
    for (const c of [4, 5]) {
      row.getCell(c).numFmt = '#,##0.00';
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
      if (row.getCell(c).value !== null) row.getCell(c).font = { bold: true, size: 10, name: "Calibri", color: { argb: c === 4 ? C.ACCENT : "FF7C3AED" } };
    }
  });

  // Grand total row
  ws.addRow([]);
  const tot = ws.addRow(["", "GRAND TOTAL", "", parseFloat(report.grandDebit), parseFloat(report.grandCredit)]);
  tot.height = 24;
  for (let c = 1; c <= COLS; c++) {
    const cell = tot.getCell(c);
    cell.fill = solid(report.balanced ? "FFD1FAE5" : "FFFEE2E2");
    cell.font = { bold: true, size: 11, color: { argb: report.balanced ? C.GREEN : C.RED }, name: "Calibri" };
    cell.border = { top: { style: "medium", color: { argb: report.balanced ? C.GREEN : C.RED } }, bottom: { style: "medium", color: { argb: report.balanced ? C.GREEN : C.RED } } };
    if (c >= 4) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: "right", vertical: "middle" }; }
  }

  // Balance status note
  ws.addRow([]);
  const note = ws.addRow([report.balanced ? "✓ BALANCED — Σ Debits = Σ Credits" : "⚠ OUT OF BALANCE", "", "", "", ""]);
  ws.mergeCells(note.number, 1, note.number, COLS);
  const nc = note.getCell(1);
  nc.font = { bold: true, italic: true, size: 10, name: "Calibri", color: { argb: report.balanced ? C.GREEN : C.RED } };
  nc.fill = solid(report.balanced ? "FFF0FDF4" : "FFFEF2F2");
  nc.alignment = { horizontal: "center", vertical: "middle" };

  await download(wb, `TrialBalance_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Stock Report Export ──────────────────────────────────────────────────────

interface StockRowExport {
  id: string; name: string; brand?: string | null; description: string | null;
  unit: string | null; unitPrice: number; openingStock: number; totalPurchased: number;
  available: number; reorderLevel: number; stockValue: number; isActive: boolean;
}

export async function exportStockReportExcel(rows: StockRowExport[], companyName = "DMXI") {
  const COLS = 9;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DMXI Accounting";
  wb.created = new Date();

  const ws = wb.addWorksheet("Stock Report");
  ws.columns = [
    { key: "name",          width: 28 },
    { key: "brand",         width: 16 },
    { key: "unit",          width: 10 },
    { key: "opening",       width: 14 },
    { key: "purchased",     width: 14 },
    { key: "available",     width: 14 },
    { key: "reorder",       width: 14 },
    { key: "unitPrice",     width: 16 },
    { key: "stockValue",    width: 18 },
  ];

  addReportHeader(ws, COLS, companyName, "Stock Report", `Generated ${fmtDate(new Date())}`);

  // KPI summary block
  const totalValue = rows.reduce((s, r) => s + r.stockValue, 0);
  const outCount   = rows.filter((r) => r.available <= 0).length;
  const lowCount   = rows.filter((r) => r.reorderLevel > 0 && r.available > 0 && r.available <= r.reorderLevel).length;

  const kpiLabels = ["Total Products", "Stock Value", "Low Stock", "Out of Stock"];
  const kpiValues = [String(rows.length), totalValue, String(lowCount), String(outCount)];
  const kpiColors = [C.ACCENT, C.GREEN, C.AMBER, C.RED];
  [kpiLabels, kpiValues].forEach((arr, rowIdx) => {
    const r = ws.addRow(arr);
    r.height = rowIdx === 0 ? 14 : 20;
    arr.forEach((_, i) => {
      const cell = r.getCell(i * 2 + 1);
      if (rowIdx === 0) {
        cell.font = { bold: true, size: 8, color: { argb: C.MUTED }, name: "Calibri" };
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else {
        cell.font = { bold: true, size: 13, color: { argb: kpiColors[i] }, name: "Calibri" };
        cell.alignment = { horizontal: "left", vertical: "middle" };
        if (i === 1) { cell.numFmt = '#,##0.00'; }
      }
    });
  });
  ws.addRow([]);

  addHeaderRow(ws, ["Product", "Brand", "Unit", "Opening", "Purchased", "Available", "Reorder", "Unit Price", "Stock Value"], [4, 5, 6, 7, 8, 9]);

  rows.forEach((r, idx) => {
    const st = r.available <= 0 ? "out" : (r.reorderLevel > 0 && r.available <= r.reorderLevel ? "low" : "ok");
    const stColor = st === "out" ? C.RED : st === "low" ? C.AMBER : C.GREEN;
    const row = ws.addRow([
      r.name,
      r.brand ?? "—",
      r.unit ?? "—",
      r.openingStock,
      r.totalPurchased,
      r.available,
      r.reorderLevel > 0 ? r.reorderLevel : "—",
      r.unitPrice,
      r.stockValue,
    ]);
    styleDataRow(row, COLS, idx % 2 === 1);

    // Color-code available qty by status
    const avlCell = row.getCell(6);
    avlCell.font = { bold: true, size: 10, name: "Calibri", color: { argb: stColor } };

    // Right-align numeric cols
    [4, 5, 6, 8, 9].forEach((c) => {
      row.getCell(c).numFmt = '#,##0.##';
      row.getCell(c).alignment = { horizontal: "right", vertical: "middle" };
    });
  });

  // Total row
  const totalRow = ws.addRow(["", "", "", "", "", "", "Total Value", "", totalValue]);
  totalRow.height = 22;
  ws.mergeCells(totalRow.number, 7, totalRow.number, 8);
  for (let c = 1; c <= COLS; c++) {
    const cell = totalRow.getCell(c);
    cell.fill   = solid(C.TOTAL_BG);
    cell.border = thinBorder(C.ACCENT);
    cell.font   = { bold: true, size: 11, name: "Calibri", color: { argb: c === 9 ? C.ACCENT : C.TITLE_FG } };
    cell.alignment = { horizontal: c >= 7 ? "right" : "left", vertical: "middle" };
  }
  const totalCell = totalRow.getCell(9);
  totalCell.numFmt = '#,##0.00';

  await download(wb, `StockReport_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Stock Count Excel ────────────────────────────────────────────────────────

export interface StockCountItemExcel {
  productName: string;
  brand:       string | null;
  unit:        string | null;
  systemQty:   number | string;
  countedQty:  number | string;
  variance:    number | string;
  unitPrice:   number | string;
}

export interface StockCountExcel {
  countDate: string | Date;
  note:      string | null;
  createdBy: string;
  items:     StockCountItemExcel[];
}

export async function exportStockCountExcel(count: StockCountExcel, companyName = "DMXI") {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();

  const ws = wb.addWorksheet("Stock Count", { views: [{ state: "frozen", ySplit: 8 }] });
  const COLS = 8;

  ws.columns = [
    { key: "product",   width: 36 },
    { key: "brand",     width: 18 },
    { key: "unit",      width: 10 },
    { key: "systemQty", width: 14 },
    { key: "counted",   width: 14 },
    { key: "variance",  width: 14 },
    { key: "price",     width: 16 },
    { key: "value",     width: 18 },
  ];

  // Title block
  ws.addRow([]);
  const titleRow = ws.addRow([`${companyName} — Stock Count`]);
  titleRow.getCell(1).font = { bold: true, size: 16, name: "Calibri", color: { argb: C.ACCENT } };
  ws.addRow([`Count Date: ${new Date(count.countDate).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}`])
    .getCell(1).font = { size: 11, name: "Calibri", color: { argb: C.MUTED } };
  if (count.note) {
    ws.addRow([`Note: ${count.note}`]).getCell(1).font = { italic: true, size: 10, name: "Calibri", color: { argb: C.MUTED } };
  } else {
    ws.addRow([]);
  }

  // KPI summary
  const totalItems  = count.items.length;
  const adjusted    = count.items.filter((i) => Number(i.variance) !== 0).length;
  const netVariance = count.items.reduce((s, i) => s + Number(i.variance), 0);
  const totalValue  = count.items.reduce((s, i) => s + Number(i.countedQty) * Number(i.unitPrice), 0);

  const kpiRow = ws.addRow(["Products Counted", totalItems, "", "Adjusted", adjusted, "", "Net Variance", netVariance]);
  kpiRow.eachCell((cell, col) => {
    if ([1, 4, 7].includes(col)) {
      cell.font = { bold: true, size: 9, name: "Calibri", color: { argb: C.MUTED } };
    } else if ([2, 5, 8].includes(col)) {
      cell.font = { bold: true, size: 14, name: "Calibri", color: { argb: C.ACCENT } };
    }
  });
  ws.addRow([]);

  // Header row
  const headerRow = ws.addRow(["Product", "Brand", "Unit", "System Qty", "Counted", "Variance", "Unit Price", "Count Value"]);
  headerRow.height = 26;
  for (let c = 1; c <= COLS; c++) {
    const cell = headerRow.getCell(c);
    cell.fill   = solid(C.HEADER_BG);
    cell.font   = { bold: true, size: 10, name: "Calibri", color: { argb: C.HEADER_FG } };
    cell.border = thinBorder(C.BORDER_DARK);
    cell.alignment = { horizontal: c >= 4 ? "right" : "left", vertical: "middle" };
  }

  // Data rows
  count.items.forEach((r, idx) => {
    const v   = Number(r.variance);
    const val = Number(r.countedQty) * Number(r.unitPrice);
    const row = ws.addRow([
      r.productName,
      r.brand ?? "—",
      r.unit ?? "—",
      Number(r.systemQty),
      Number(r.countedQty),
      v,
      Number(r.unitPrice),
      val,
    ]);
    styleDataRow(row, COLS, idx % 2 === 1);

    // Color-code variance
    const vCell = row.getCell(6);
    vCell.font = {
      bold: v !== 0, size: 10, name: "Calibri",
      color: { argb: v > 0 ? C.GREEN : v < 0 ? C.RED : C.MUTED },
    };
    if (v > 0)      vCell.fill = solid(C.GREEN_LIGHT);
    else if (v < 0) vCell.fill = solid("FFFEE2E2"); // red-100

    // Right-align & format numerics
    [4, 5, 6, 7, 8].forEach((c) => {
      const cell = row.getCell(c);
      cell.numFmt    = c >= 7 ? '#,##0.00' : '#,##0.##';
      cell.alignment = { horizontal: "right", vertical: "middle" };
    });
  });

  // Total row
  const totalRow = ws.addRow(["", "", "", "", "", "Total Count Value", "", totalValue]);
  totalRow.height = 22;
  ws.mergeCells(totalRow.number, 6, totalRow.number, 7);
  for (let c = 1; c <= COLS; c++) {
    const cell = totalRow.getCell(c);
    cell.fill   = solid(C.TOTAL_BG);
    cell.border = thinBorder(C.ACCENT);
    cell.font   = { bold: true, size: 11, name: "Calibri", color: { argb: c === 8 ? C.ACCENT : C.TITLE_FG } };
    cell.alignment = { horizontal: c >= 6 ? "right" : "left", vertical: "middle" };
  }
  totalRow.getCell(8).numFmt = '#,##0.00';

  const dateStr = new Date(count.countDate).toISOString().slice(0, 10);
  await download(wb, `StockCount_${dateStr}.xlsx`);
}

// ─── Statement Excel ──────────────────────────────────────────────────────────

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

export async function exportStatementExcel(
  lines: StatementLine[],
  meta: StatementExportMeta,
  companyName = "DMXI",
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();

  const ws = wb.addWorksheet("Statement", { views: [{ state: "frozen", ySplit: 7 }] });

  // Dynamic column list
  const colDefs: { key: string; width: number }[] = [
    { key: "date",       width: 14 },
    { key: "voucher",    width: 18 },
    { key: "ref",        width: 18 },
    { key: "type",       width: 13 },
    ...(meta.showVendor ? [{ key: "vendor", width: 20 }] : []),
    { key: "desc",       width: 40 },
    { key: "debit",      width: 16 },
    { key: "credit",     width: 16 },
    { key: "balance",    width: 16 },
  ];
  ws.columns = colDefs;
  const COLS = colDefs.length;

  // Title block
  ws.addRow([]);
  ws.addRow([`${companyName} — ${meta.title}`])
    .getCell(1).font = { bold: true, size: 15, name: "Calibri", color: { argb: C.ACCENT } };
  if (meta.subtitle) {
    ws.addRow([meta.subtitle]).getCell(1).font = { italic: true, size: 10, name: "Calibri", color: { argb: C.MUTED } };
  } else {
    ws.addRow([]);
  }

  // KPI row
  const kpiRow = ws.addRow([
    meta.debitHeader + " Total", meta.totalDebit, "",
    meta.creditHeader + " Total", meta.totalCredit, "",
    meta.balanceLabel, meta.balance,
  ]);
  kpiRow.eachCell((cell, col) => {
    if ([1, 4, 7].includes(col)) {
      cell.font = { bold: true, size: 9, name: "Calibri", color: { argb: C.MUTED } };
    } else if ([2, 5, 8].includes(col)) {
      cell.font = { bold: true, size: 14, name: "Calibri",
        color: { argb: col === 8 && meta.balance > 0 ? C.RED : col === 8 ? C.GREEN : C.ACCENT } };
      cell.numFmt = '#,##0.00';
    }
  });
  ws.addRow([]);

  // Header row
  const headers = ["Date", "Voucher No.", "Ref No.", "Type"];
  if (meta.showVendor) headers.push("Vendor");
  headers.push("Description", meta.debitHeader, meta.creditHeader, "Balance");

  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  for (let c = 1; c <= COLS; c++) {
    const cell = headerRow.getCell(c);
    cell.fill      = solid(C.HEADER_BG);
    cell.font      = { bold: true, size: 10, name: "Calibri", color: { argb: C.HEADER_FG } };
    cell.border    = thinBorder(C.BORDER_DARK);
    const numStart = meta.showVendor ? 7 : 6;
    cell.alignment = { horizontal: c >= numStart ? "right" : "left", vertical: "middle" };
  }

  // Data rows
  lines.forEach((l, idx) => {
    const rowData: (string | number | Date)[] = [
      new Date(l.date),
      l.voucherNo,
      l.reference ?? "—",
      l.type,
    ];
    if (meta.showVendor) rowData.push(l.vendor ?? "—");
    rowData.push(l.description, l.debit, l.credit, l.balance);

    const row = ws.addRow(rowData);
    styleDataRow(row, COLS, idx % 2 === 1);

    // Format date
    row.getCell(1).numFmt = "dd-mmm-yyyy";

    const numStart = meta.showVendor ? 6 : 5;
    // Debit, Credit, Balance numeric formatting
    for (let c = numStart; c <= COLS; c++) {
      const cell = row.getCell(c);
      cell.numFmt    = '#,##0.00';
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }

    // Colour balance cell
    const balCell = row.getCell(COLS);
    balCell.font = {
      bold: true, size: 10, name: "Calibri",
      color: { argb: l.balance > 0 ? C.RED : C.GREEN },
    };

    // Dim zero debit/credit cells
    const debitCell  = row.getCell(numStart);
    const creditCell = row.getCell(numStart + 1);
    if (l.debit  === 0) debitCell.font  = { size: 10, name: "Calibri", color: { argb: C.MUTED } };
    if (l.credit === 0) creditCell.font = { size: 10, name: "Calibri", color: { argb: C.MUTED } };

    // Badge-style fill for type cell
    const typeCell = row.getCell(4);
    const isDebit  = ["Invoice", "Expense", "Purchase"].includes(l.type);
    typeCell.fill  = solid(isDebit ? "FFE8EDFF" : "FFF0FDF4");
    typeCell.font  = { bold: true, size: 9, name: "Calibri", color: { argb: isDebit ? C.ACCENT : C.GREEN } };
  });

  // Totals row
  const totalsData: (string | number)[] = ["", "", "", ""];
  if (meta.showVendor) totalsData.push("");
  totalsData.push("Totals", meta.totalDebit, meta.totalCredit, meta.balance);

  const totalRow = ws.addRow(totalsData);
  totalRow.height = 22;
  for (let c = 1; c <= COLS; c++) {
    const cell = totalRow.getCell(c);
    cell.fill   = solid(C.TOTAL_BG);
    cell.border = thinBorder(C.ACCENT);
    cell.font   = { bold: true, size: 10, name: "Calibri", color: { argb: C.TITLE_FG } };
    const numStart = meta.showVendor ? 6 : 5;
    if (c >= numStart) {
      cell.numFmt    = '#,##0.00';
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
  }
  // Colour balance total
  totalRow.getCell(COLS).font = {
    bold: true, size: 11, name: "Calibri",
    color: { argb: meta.balance > 0 ? C.RED : C.GREEN },
  };

  const slug = meta.title.replace(/[^a-zA-Z0-9]+/g, "_");
  await download(wb, `Statement_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
