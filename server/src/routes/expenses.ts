import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";
import { postJournal, EXPENSE_CATEGORY_ACCOUNT } from "../lib/accounting";
import { logAudit } from "../lib/audit";

export const expensesRouter = Router({ mergeParams: true });

expensesRouter.use(requireCompanyMember("VIEWER"));

// ---------- Vendors ----------

const vendorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

expensesRouter.get("/vendors", async (req: CompanyScopedRequest, res) => {
  const vendors = await prisma.vendor.findMany({
    where: { companyId: req.companyId! },
    orderBy: { name: "asc" },
  });
  res.json(vendors);
});

expensesRouter.post("/vendors", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const parsed = vendorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const duplicate = await prisma.vendor.findFirst({
    where: { companyId: req.companyId!, name: parsed.data.name },
  });
  if (duplicate) return res.status(409).json({ error: `A vendor named "${duplicate.name}" already exists.` });

  const vendor = await prisma.vendor.create({
    data: { companyId: req.companyId!, ...parsed.data },
  });
  res.status(201).json(vendor);
});

// ---------- Expenses ----------

const expenseSchema = z.object({
  vendorId: z.string().uuid().optional(),
  category: z.string().min(1),
  description: z.string().optional(),
  reference: z.string().optional(),
  amount: z.number().positive(),
  date: z.coerce.date(),
  status: z.enum(["UNPAID", "PAID"]).optional(),
});

expensesRouter.get("/expenses", async (req: CompanyScopedRequest, res) => {
  const expenses = await prisma.expense.findMany({
    where: { companyId: req.companyId! },
    include: { vendor: true },
    orderBy: { date: "desc" },
  });
  res.json(expenses);
});

expensesRouter.post("/expenses", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { vendorId, ...rest } = parsed.data;

  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId: req.companyId! } });
    if (!vendor) return res.status(400).json({ error: "Vendor not found for this company" });
  }

  const expense = await prisma.$transaction(async (tx) => {
    // Auto-generate voucher number EXP-YYYY-NNNN
    const updated = await tx.company.update({
      where: { id: req.companyId! },
      data: { expenseSeq: { increment: 1 } },
      select: { expenseSeq: true },
    });
    const year = new Date().getFullYear();
    const voucherNo = `EXP-${year}-${String(updated.expenseSeq).padStart(4, "0")}`;

    const exp = await tx.expense.create({
      data: { companyId: req.companyId!, vendorId, voucherNo, ...rest },
      include: { vendor: true },
    });

    const expenseCode = EXPENSE_CATEGORY_ACCOUNT[exp.category] ?? "5000";
    const creditCode = exp.status === "PAID" ? "1000" : "2000";
    await postJournal(tx, req.companyId!, {
      date:      exp.date,
      memo:      `${exp.category} expense${exp.description ? ` — ${exp.description}` : ""}`,
      reference: voucherNo,
      lines: [
        { accountCode: expenseCode, debit:  exp.amount, description: exp.category },
        { accountCode: creditCode,  credit: exp.amount, description: exp.category },
      ],
    });

    return exp;
  });

  logAudit({
    companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
    action: "CREATE", entity: "Expense", entityId: expense.id, entityRef: expense.voucherNo ?? undefined,
    changes: { category: expense.category, amount: Number(expense.amount), status: expense.status },
  });

  res.status(201).json(expense);
});

const expenseStatusSchema = z.object({
  status: z.enum(["UNPAID", "PAID", "CANCELLED"]),
  paidDate: z.coerce.date().optional(),
  paymentMethod: z.string().optional(),
});

expensesRouter.patch(
  "/expenses/:expenseId/status",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = expenseStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const expense = await prisma.expense.findFirst({
      where: { id: req.params.expenseId, companyId: req.companyId! },
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const updated = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.update({
        where: { id: expense.id },
        data:  { status: parsed.data.status },
        include: { vendor: true },
      });

      // Only post settlement entry when moving UNPAID → PAID
      if (expense.status === "UNPAID" && parsed.data.status === "PAID") {
        const payDate = parsed.data.paidDate ?? new Date();
        const method  = parsed.data.paymentMethod ? ` via ${parsed.data.paymentMethod}` : "";
        await postJournal(tx, req.companyId!, {
          date:  payDate,
          memo:  `Payment of ${exp.category} expense${method}`,
          lines: [
            { accountCode: "2000", debit:  exp.amount, description: "Settle payable" },
            { accountCode: "1000", credit: exp.amount, description: `Cash paid${method}` },
          ],
        });
      }

      return exp;
    });

    res.json(updated);
  }
);

// ---------- Cancel expense ----------

expensesRouter.post(
  "/expenses/:expenseId/cancel",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const reason: string | undefined = req.body.reason;
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.expenseId, companyId: req.companyId! },
      include: { vendor: true },
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    if (expense.status === "CANCELLED") return res.status(400).json({ error: "Already cancelled" });

    const updated = await prisma.$transaction(async (tx) => {
      const expenseCode = EXPENSE_CATEGORY_ACCOUNT[expense.category] ?? "5000";
      // Credit account for original debit: AP if unpaid, Cash if paid
      const creditCode = expense.status === "PAID" ? "1000" : "2000";
      await postJournal(tx, req.companyId!, {
        date:      new Date(),
        memo:      `VOID — ${expense.category}${expense.description ? ` — ${expense.description}` : ""}${reason ? ` (${reason})` : ""}`,
        reference: expense.voucherNo ? `REV-${expense.voucherNo}` : undefined,
        lines: [
          { accountCode: creditCode,   debit:  expense.amount, description: `Void ${expense.voucherNo ?? expense.id.slice(0, 8)}` },
          { accountCode: expenseCode,  credit: expense.amount, description: `Void ${expense.voucherNo ?? expense.id.slice(0, 8)}` },
        ],
      });
      return tx.expense.update({
        where: { id: expense.id },
        data:  { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
        include: { vendor: true },
      });
    });

    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: "CANCEL", entity: "Expense", entityId: updated.id, entityRef: updated.voucherNo ?? undefined,
      changes: { before: { status: expense.status }, after: { status: "CANCELLED", cancelReason: reason } },
    });

    res.json(updated);
  }
);

// ---------- Delete expense (Admin/Owner only) ----------

expensesRouter.delete(
  "/expenses/:expenseId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.expenseId, companyId: req.companyId! },
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    await prisma.$transaction(async (tx) => {
      if (expense.status !== "CANCELLED") {
        const expenseCode = EXPENSE_CATEGORY_ACCOUNT[expense.category] ?? "5000";
        const creditCode = expense.status === "PAID" ? "1000" : "2000";
        await postJournal(tx, req.companyId!, {
          date:      new Date(),
          memo:      `DELETED — ${expense.category}${expense.description ? ` — ${expense.description}` : ""}`,
          reference: expense.voucherNo ? `DEL-${expense.voucherNo}` : undefined,
          lines: [
            { accountCode: creditCode,  debit:  expense.amount, description: `Deleted ${expense.voucherNo ?? expense.id.slice(0, 8)}` },
            { accountCode: expenseCode, credit: expense.amount, description: `Deleted ${expense.voucherNo ?? expense.id.slice(0, 8)}` },
          ],
        });
      }
      await tx.expense.delete({ where: { id: expense.id } });
    });

    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: "DELETE", entity: "Expense", entityId: expense.id, entityRef: expense.voucherNo ?? undefined,
      changes: { category: expense.category, amount: Number(expense.amount), status: expense.status },
    });

    res.json({ success: true });
  }
);

// ---------- Vendor Statement (subsidiary ledger) ----------

expensesRouter.get("/vendors/:vendorId/statement", async (req: CompanyScopedRequest, res) => {
  const vendor = await prisma.vendor.findFirst({
    where: { id: req.params.vendorId, companyId: req.companyId! },
  });
  if (!vendor) return res.status(404).json({ error: "Vendor not found" });

  const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : null;
  const to   = typeof req.query.to   === "string" && req.query.to   ? new Date(req.query.to + "T23:59:59") : null;
  const dateFilter = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const [expenses, purchases] = await Promise.all([
    prisma.expense.findMany({
      where: { vendorId: vendor.id, companyId: req.companyId!, ...dateFilter },
      orderBy: { date: "asc" },
    }),
    prisma.purchase.findMany({
      where: { vendorId: vendor.id, companyId: req.companyId!, ...dateFilter },
      include: { items: { include: { product: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  type Line = {
    id: string; date: Date; voucherNo: string; reference: string | null;
    type: string; description: string; debit: number; credit: number;
  };
  const lines: Line[] = [];

  for (const e of expenses) {
    const vch = e.reference ?? `EXP-${e.id.slice(0, 8).toUpperCase()}`;
    const desc = `${e.category}${e.description ? ` — ${e.description}` : ""}`;
    lines.push({ id: e.id + "-c", date: e.date, voucherNo: vch, reference: e.reference ?? null, type: "Expense", description: desc, debit: 0, credit: Number(e.amount) });
    if (e.status === "PAID") {
      lines.push({ id: e.id + "-p", date: e.updatedAt, voucherNo: `PMT/${vch}`, reference: e.reference ?? null, type: "Payment", description: `Paid — ${desc}`, debit: Number(e.amount), credit: 0 });
    }
  }

  for (const p of purchases) {
    const total = p.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0);
    const first = p.items[0];
    const label = (first?.product?.name ?? first?.description ?? "Purchase") +
      (p.items.length > 1 ? ` + ${p.items.length - 1} more` : "");
    const vch = p.voucherNo ?? p.reference ?? `PUR-${p.id.slice(0, 8).toUpperCase()}`;
    lines.push({ id: p.id + "-c", date: p.date, voucherNo: vch, reference: p.reference ?? null, type: "Purchase", description: label, debit: 0, credit: total });
    if (p.status === "PAID") {
      lines.push({ id: p.id + "-p", date: p.updatedAt, voucherNo: `PMT/${vch}`, reference: p.reference ?? null, type: "Payment", description: `Paid — ${label}`, debit: total, credit: 0 });
    }
  }

  lines.sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = 0;
  const rows = lines.map((l) => {
    balance += l.credit - l.debit;
    return { ...l, balance };
  });

  const totalCredit = rows.reduce((s, l) => s + l.credit, 0);
  const totalDebit  = rows.reduce((s, l) => s + l.debit,  0);

  res.json({ vendor, lines: rows, totalCredit, totalDebit, balance });
});
