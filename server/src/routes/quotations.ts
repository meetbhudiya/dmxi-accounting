import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";

export const quotationsRouter = Router({ mergeParams: true });

quotationsRouter.use(requireCompanyMember("VIEWER"));

const itemSchema = z.object({
  description: z.string().min(1),
  qty:         z.number().positive(),
  unitPrice:   z.number().nonnegative(),
});

const quotationSchema = z.object({
  customer:   z.string().min(1),
  issueDate:  z.coerce.date(),
  validUntil: z.coerce.date(),
  notes:      z.string().optional(),
  vatPercent: z.number().min(0).max(100).default(0),
  items:      z.array(itemSchema).min(1),
});

function calcTotals(items: { qty: number; unitPrice: number }[], vatPercent: number) {
  const subtotal  = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const vatAmount = subtotal * (vatPercent / 100);
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}

// ── LIST ─────────────────────────────────────────────────────────────────────

quotationsRouter.get("/quotations", async (req: CompanyScopedRequest, res, next) => {
  try {
    const rows = await prisma.quotation.findMany({
      where:   { companyId: req.companyId! },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(rows);
  } catch (err) { next(err); }
});

// ── CREATE ────────────────────────────────────────────────────────────────────

quotationsRouter.post("/quotations", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res, next) => {
  try {
    const parsed = quotationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { customer, issueDate, validUntil, notes, vatPercent, items } = parsed.data;
    const { subtotal, vatAmount, total } = calcTotals(items, vatPercent);

    const updated = await prisma.company.update({
      where: { id: req.companyId! },
      data:  { quotationSeq: { increment: 1 } },
    });
    const number = `QT-${String(updated.quotationSeq).padStart(4, "0")}`;

    const quotation = await prisma.quotation.create({
      data: {
        companyId: req.companyId!,
        number,
        customer,
        issueDate,
        validUntil,
        notes:      notes ?? null,
        vatPercent,
        subtotal,
        vatAmount,
        total,
        items: { create: items.map((it) => ({ description: it.description, qty: it.qty, unitPrice: it.unitPrice })) },
      },
      include: { items: true },
    });

    res.status(201).json(quotation);
  } catch (err) { next(err); }
});

// ── UPDATE (full edit) ────────────────────────────────────────────────────────

quotationsRouter.patch("/quotations/:id", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res, next) => {
  try {
    const parsed = quotationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, companyId: req.companyId! } });
    if (!existing) return res.status(404).json({ error: "Quotation not found" });

    const { customer, issueDate, validUntil, notes, vatPercent, items } = parsed.data;
    const { subtotal, vatAmount, total } = calcTotals(items, vatPercent);

    const [, updated] = await prisma.$transaction([
      prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } }),
      prisma.quotation.update({
        where: { id: req.params.id },
        data: {
          customer, issueDate, validUntil,
          notes: notes ?? null, vatPercent, subtotal, vatAmount, total,
          items: { create: items.map((it) => ({ description: it.description, qty: it.qty, unitPrice: it.unitPrice })) },
        },
        include: { items: true },
      }),
    ]);

    res.json(updated);
  } catch (err) { next(err); }
});

// ── UPDATE STATUS ─────────────────────────────────────────────────────────────

quotationsRouter.patch("/quotations/:id/status", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res, next) => {
  try {
    const schema = z.object({ status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, companyId: req.companyId! } });
    if (!existing) return res.status(404).json({ error: "Quotation not found" });

    const updated = await prisma.quotation.update({
      where:   { id: req.params.id },
      data:    { status: parsed.data.status },
      include: { items: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ── DELETE ────────────────────────────────────────────────────────────────────

quotationsRouter.delete("/quotations/:id", requireCompanyMember("ADMIN"), async (req: CompanyScopedRequest, res, next) => {
  try {
    const existing = await prisma.quotation.findFirst({ where: { id: req.params.id, companyId: req.companyId! } });
    if (!existing) return res.status(404).json({ error: "Quotation not found" });

    await prisma.quotation.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});
