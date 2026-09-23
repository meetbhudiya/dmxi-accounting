import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";

export const reportsRouter = Router({ mergeParams: true });

reportsRouter.use(requireCompanyMember("VIEWER"));

const isDebitNormal = (type: AccountType) => type === "ASSET" || type === "EXPENSE";

function netForAccount(type: AccountType, debit: Prisma.Decimal, credit: Prisma.Decimal) {
  return isDebitNormal(type) ? debit.minus(credit) : credit.minus(debit);
}

const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * Income statement (Profit & Loss): nets REVENUE and EXPENSE accounts
 * over journal activity within [from, to].
 */
reportsRouter.get("/profit-and-loss", async (req: CompanyScopedRequest, res) => {
  const parsed = dateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { from, to } = parsed.data;

  const accounts = await prisma.account.findMany({
    where: { companyId: req.companyId!, type: { in: ["REVENUE", "EXPENSE"] } },
    include: {
      journalLines: {
        where: { journalEntry: { date: { gte: from, lte: to } } },
      },
    },
    orderBy: { code: "asc" },
  });

  const lineItems = accounts.map((account) => {
    const totals = account.journalLines.reduce(
      (acc, l) => ({ debit: acc.debit.plus(l.debit), credit: acc.credit.plus(l.credit) }),
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) }
    );
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      amount: netForAccount(account.type as AccountType, totals.debit, totals.credit),
    };
  });

  const revenue = lineItems.filter((i) => i.type === "REVENUE");
  const expenses = lineItems.filter((i) => i.type === "EXPENSE");
  const totalRevenue = revenue.reduce((s, i) => s.plus(i.amount), new Prisma.Decimal(0));
  const totalExpenses = expenses.reduce((s, i) => s.plus(i.amount), new Prisma.Decimal(0));

  res.json({
    from,
    to,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue.minus(totalExpenses),
  });
});

/**
 * Balance sheet: ASSET / LIABILITY / EQUITY account balances as of a date,
 * plus retained earnings (net income to date) so the sheet balances.
 */
reportsRouter.get("/balance-sheet", async (req: CompanyScopedRequest, res) => {
  const parsed = z.object({ asOf: z.coerce.date().optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const asOf = parsed.data.asOf ?? new Date();

  const accounts = await prisma.account.findMany({
    where: { companyId: req.companyId! },
    include: {
      journalLines: { where: { journalEntry: { date: { lte: asOf } } } },
    },
    orderBy: { code: "asc" },
  });

  const balanceFor = (account: (typeof accounts)[number]) => {
    const totals = account.journalLines.reduce(
      (acc, l) => ({ debit: acc.debit.plus(l.debit), credit: acc.credit.plus(l.credit) }),
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) }
    );
    return netForAccount(account.type as AccountType, totals.debit, totals.credit);
  };

  const byType = (type: AccountType) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({ accountId: a.id, code: a.code, name: a.name, balance: balanceFor(a) }));

  const sumOf = (items: { balance: Prisma.Decimal }[]) =>
    items.reduce((s, i) => s.plus(i.balance), new Prisma.Decimal(0));

  const assets = byType("ASSET");
  const liabilities = byType("LIABILITY");
  const equity = byType("EQUITY");
  const revenue = byType("REVENUE");
  const expenses = byType("EXPENSE");

  const totalAssets = sumOf(assets);
  const totalLiabilities = sumOf(liabilities);
  const totalEquity = sumOf(equity);
  // Net income earned to date rolls into equity as retained earnings until closed out
  const retainedEarnings = sumOf(revenue).minus(sumOf(expenses));

  res.json({
    asOf,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedEarnings,
    totalLiabilitiesAndEquity: totalLiabilities.plus(totalEquity).plus(retainedEarnings),
  });
});

/**
 * Simplified cash flow: net change in ASSET accounts whose name suggests cash,
 * over the requested period, broken down by counter-account category.
 */
reportsRouter.get("/cash-flow", async (req: CompanyScopedRequest, res) => {
  const parsed = dateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { from, to } = parsed.data;

  const cashAccounts = await prisma.account.findMany({
    where: {
      companyId: req.companyId!,
      type: "ASSET",
      name: { contains: "Cash" },
    },
  });
  const cashAccountIds = cashAccounts.map((a) => a.id);

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: cashAccountIds },
      journalEntry: { date: { gte: from, lte: to } },
    },
    include: { journalEntry: { include: { lines: { include: { account: true } } } } },
  });

  let netChange = new Prisma.Decimal(0);
  const byCategory = new Map<string, Prisma.Decimal>();

  for (const line of lines) {
    const delta = line.debit.minus(line.credit); // cash is debit-normal (ASSET)
    netChange = netChange.plus(delta);

    const counterparts = line.journalEntry.lines.filter(
      (l) => !cashAccountIds.includes(l.accountId)
    );
    const label = counterparts[0]?.account.type ?? "OTHER";
    byCategory.set(label, (byCategory.get(label) ?? new Prisma.Decimal(0)).plus(delta));
  }

  res.json({
    from,
    to,
    cashAccounts: cashAccounts.map((a) => ({ id: a.id, code: a.code, name: a.name })),
    netChange,
    byCategory: Object.fromEntries(byCategory),
  });
});

/**
 * Trial Balance: every account with its cumulative DR / CR totals.
 * Proves double-entry integrity: Σ DR = Σ CR across all lines.
 */
reportsRouter.get("/trial-balance", async (req: CompanyScopedRequest, res) => {
  const parsed = z.object({ asOf: z.coerce.date().optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const asOf = parsed.data.asOf ?? new Date();

  const accounts = await prisma.account.findMany({
    where: { companyId: req.companyId! },
    include: {
      journalLines: {
        where: { journalEntry: { date: { lte: asOf } } },
      },
    },
    orderBy: { code: "asc" },
  });

  let grandDebit  = new Prisma.Decimal(0);
  let grandCredit = new Prisma.Decimal(0);

  const rows = accounts
    .map((account) => {
      const totals = account.journalLines.reduce(
        (acc, l) => ({ debit: acc.debit.plus(l.debit), credit: acc.credit.plus(l.credit) }),
        { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) }
      );
      grandDebit  = grandDebit.plus(totals.debit);
      grandCredit = grandCredit.plus(totals.credit);
      return {
        accountId: account.id,
        code:      account.code,
        name:      account.name,
        type:      account.type,
        debit:     totals.debit,
        credit:    totals.credit,
      };
    })
    .filter((r) => r.debit.gt(0) || r.credit.gt(0)); // skip zero-activity accounts

  res.json({
    asOf,
    rows,
    grandDebit,
    grandCredit,
    balanced: grandDebit.equals(grandCredit),
  });
});

/**
 * Monthly P&L breakdown — revenue, expenses, net income per calendar month
 * in the requested range. Used to render the trend bar chart.
 */
reportsRouter.get("/profit-and-loss-monthly", async (req: CompanyScopedRequest, res) => {
  const parsed = dateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { from, to } = parsed.data;

  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: { companyId: req.companyId!, date: { gte: from, lte: to } },
      account: { type: { in: ["REVENUE", "EXPENSE"] } },
    },
    include: {
      account: { select: { type: true } },
      journalEntry: { select: { date: true } },
    },
  });

  // Aggregate per calendar month
  const byMonth = new Map<string, { revenue: Prisma.Decimal; expenses: Prisma.Decimal }>();
  for (const line of lines) {
    const key = line.journalEntry.date.toISOString().slice(0, 7); // "YYYY-MM"
    const bucket = byMonth.get(key) ?? { revenue: new Prisma.Decimal(0), expenses: new Prisma.Decimal(0) };
    if (line.account.type === "REVENUE") {
      bucket.revenue = bucket.revenue.plus(line.credit).minus(line.debit);
    } else {
      bucket.expenses = bucket.expenses.plus(line.debit).minus(line.credit);
    }
    byMonth.set(key, bucket);
  }

  // Fill every month in range (so months with zero still appear)
  const start = from ?? (lines[0]?.journalEntry.date ?? new Date());
  const end   = to   ?? new Date();
  const months: { month: string; label: string; revenue: number; expenses: number; netIncome: number }[] = [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const finish = new Date(end.getFullYear(),   end.getMonth(),   1);
  while (cursor <= finish) {
    const key = cursor.toISOString().slice(0, 7);
    const label = cursor.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const b = byMonth.get(key);
    const revenue  = b ? b.revenue.toNumber()  : 0;
    const expenses = b ? b.expenses.toNumber() : 0;
    months.push({ month: key, label, revenue, expenses, netIncome: revenue - expenses });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  res.json({ months });
});

/**
 * Dashboard summary: quick KPIs for the company landing page.
 */
reportsRouter.get("/dashboard", async (req: CompanyScopedRequest, res) => {
  const companyId = req.companyId!;

  const [openInvoices, unpaidExpenses, customerCount, vendorCount] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { items: true, payments: true },
    }),
    prisma.expense.aggregate({
      where: { companyId, status: "UNPAID" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.customer.count({ where: { companyId } }),
    prisma.vendor.count({ where: { companyId } }),
  ]);

  const totalReceivable = openInvoices.reduce((sum, inv) => {
    const subtotal = inv.items.reduce(
      (s, i) => s.plus(new Prisma.Decimal(i.quantity).times(i.unitPrice)),
      new Prisma.Decimal(0)
    );
    const paid = inv.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
    return sum.plus(subtotal.minus(paid));
  }, new Prisma.Decimal(0));

  res.json({
    openInvoiceCount: openInvoices.length,
    totalReceivable,
    unpaidExpenseCount: unpaidExpenses._count,
    totalPayable: unpaidExpenses._sum.amount ?? new Prisma.Decimal(0),
    customerCount,
    vendorCount,
  });
});
