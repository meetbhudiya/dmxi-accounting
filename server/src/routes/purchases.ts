import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";
import { postJournal } from "../lib/accounting";

export const purchasesRouter = Router({ mergeParams: true });

purchasesRouter.use(requireCompanyMember("VIEWER"));

const purchaseItemSchema = z.object({
  productId:   z.string().uuid().optional(),
  description: z.string().optional(),
  quantity:    z.number().positive(),
  unitCost:    z.number().nonnegative(),
});

const purchaseSchema = z.object({
  vendorId:   z.string().uuid().optional(),
  date:       z.coerce.date(),
  status:     z.enum(["UNPAID", "PAID"]).optional(),
  reference:  z.string().optional(),
  vatPercent: z.number().min(0).max(100).optional(),
  items:      z.array(purchaseItemSchema).min(1, "At least one item is required"),
});

const statusSchema = z.object({
  status:        z.enum(["UNPAID", "PAID", "CANCELLED"]),
  paidDate:      z.coerce.date().optional(),
  paymentMethod: z.string().optional(),
});

const INCLUDE = {
  vendor: true,
  items: { include: { product: { include: { brand: true } } } },
} as const;

function calcTotal(items: Array<{ quantity: Prisma.Decimal | number; unitCost: Prisma.Decimal | number }>) {
  return items.reduce(
    (s, i) => s.plus(new Prisma.Decimal(String(i.quantity)).times(new Prisma.Decimal(String(i.unitCost)))),
    new Prisma.Decimal(0),
  );
}

function itemsLabel(items: Array<{ product?: { name: string } | null; description?: string | null }>) {
  if (items.length === 0) return "Purchase";
  const first = items[0].product?.name ?? items[0].description ?? "Item";
  return items.length === 1 ? first : `${first} + ${items.length - 1} more`;
}

// ── GET /purchases ────────────────────────────────────────────────────────────

purchasesRouter.get("/purchases", async (req: CompanyScopedRequest, res) => {
  const purchases = await prisma.purchase.findMany({
    where:   { companyId: req.companyId! },
    include: INCLUDE,
    orderBy: { date: "desc" },
  });
  res.json(purchases);
});

// ── POST /purchases ───────────────────────────────────────────────────────────

purchasesRouter.post("/purchases", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { vendorId, items, ...rest } = parsed.data;

  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, companyId: req.companyId! } });
    if (!vendor) return res.status(400).json({ error: "Vendor not found for this company" });
  }

  for (const item of items) {
    if (item.productId) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, companyId: req.companyId! } });
      if (!product) return res.status(400).json({ error: "Product not found for this company" });
    }
  }

  const purchase = await prisma.$transaction(async (tx) => {
    const updated = await tx.company.update({
      where:  { id: req.companyId! },
      data:   { purchaseSeq: { increment: 1 } },
      select: { purchaseSeq: true },
    });
    const year      = new Date().getFullYear();
    const voucherNo = `PUR-${year}-${String(updated.purchaseSeq).padStart(4, "0")}`;

    const p = await tx.purchase.create({
      data: {
        companyId: req.companyId!, vendorId, voucherNo, ...rest,
        items: {
          create: items.map((item) => ({
            productId:   item.productId,
            description: item.description,
            quantity:    item.quantity,
            unitCost:    item.unitCost,
          })),
        },
      },
      include: INCLUDE,
    });

    const subtotal   = calcTotal(p.items);
    const vatAmt     = subtotal.times(new Prisma.Decimal(String(rest.vatPercent ?? 0))).div(100);
    const total      = subtotal.plus(vatAmt);
    const label      = itemsLabel(p.items);
    const creditCode = p.status === "PAID" ? "1000" : "2000";

    await postJournal(tx, req.companyId!, {
      date:      p.date,
      memo:      `Purchase — ${label}`,
      reference: voucherNo,
      lines: [
        { accountCode: "1200",     debit:  total, description: label },
        { accountCode: creditCode, credit: total, description: label },
      ],
    });

    return p;
  });

  res.status(201).json(purchase);
});

// ── PATCH /purchases/:purchaseId/status ───────────────────────────────────────

purchasesRouter.patch(
  "/purchases/:purchaseId/status",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const purchase = await prisma.purchase.findFirst({
      where:   { id: req.params.purchaseId, companyId: req.companyId! },
      include: { items: { include: { product: true } } },
    });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.update({
        where:   { id: purchase.id },
        data:    { status: parsed.data.status },
        include: INCLUDE,
      });

      if (purchase.status === "UNPAID" && parsed.data.status === "PAID") {
        const total   = calcTotal(purchase.items);
        const label   = itemsLabel(purchase.items);
        const payDate = parsed.data.paidDate ?? new Date();
        const method  = parsed.data.paymentMethod ? ` via ${parsed.data.paymentMethod}` : "";
        await postJournal(tx, req.companyId!, {
          date:  payDate,
          memo:  `Payment of purchase — ${label}${method}`,
          lines: [
            { accountCode: "2000", debit:  total, description: "Settle payable" },
            { accountCode: "1000", credit: total, description: `Cash paid${method}` },
          ],
        });
      }

      return p;
    });

    res.json(updated);
  },
);

// ── POST /purchases/:purchaseId/cancel ────────────────────────────────────────

purchasesRouter.post(
  "/purchases/:purchaseId/cancel",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const reason: string | undefined = req.body.reason;
    const purchase = await prisma.purchase.findFirst({
      where:   { id: req.params.purchaseId, companyId: req.companyId! },
      include: { items: { include: { product: true } } },
    });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });
    if (purchase.status === "CANCELLED") return res.status(400).json({ error: "Already cancelled" });

    const updated = await prisma.$transaction(async (tx) => {
      const total      = calcTotal(purchase.items);
      const label      = itemsLabel(purchase.items);
      const creditCode = purchase.status === "PAID" ? "1000" : "2000";
      await postJournal(tx, req.companyId!, {
        date:      new Date(),
        memo:      `VOID — ${label}${reason ? ` (${reason})` : ""}`,
        reference: purchase.voucherNo ? `REV-${purchase.voucherNo}` : undefined,
        lines: [
          { accountCode: creditCode, debit:  total, description: `Void ${purchase.voucherNo ?? purchase.id.slice(0, 8)}` },
          { accountCode: "1200",     credit: total, description: `Void ${purchase.voucherNo ?? purchase.id.slice(0, 8)}` },
        ],
      });
      return tx.purchase.update({
        where:   { id: purchase.id },
        data:    { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
        include: INCLUDE,
      });
    });

    res.json(updated);
  },
);

// ── DELETE /purchases/:purchaseId ─────────────────────────────────────────────

purchasesRouter.delete(
  "/purchases/:purchaseId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const purchase = await prisma.purchase.findFirst({
      where:   { id: req.params.purchaseId, companyId: req.companyId! },
      include: { items: { include: { product: true } } },
    });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });

    await prisma.$transaction(async (tx) => {
      if (purchase.status !== "CANCELLED") {
        const total      = calcTotal(purchase.items);
        const label      = itemsLabel(purchase.items);
        const creditCode = purchase.status === "PAID" ? "1000" : "2000";
        await postJournal(tx, req.companyId!, {
          date:      new Date(),
          memo:      `DELETED — ${label}`,
          reference: purchase.voucherNo ? `DEL-${purchase.voucherNo}` : undefined,
          lines: [
            { accountCode: creditCode, debit:  total, description: `Deleted ${purchase.voucherNo ?? purchase.id.slice(0, 8)}` },
            { accountCode: "1200",     credit: total, description: `Deleted ${purchase.voucherNo ?? purchase.id.slice(0, 8)}` },
          ],
        });
      }
      await tx.purchase.delete({ where: { id: purchase.id } });
    });

    res.json({ success: true });
  },
);
