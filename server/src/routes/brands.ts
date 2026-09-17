import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";

export const brandsRouter = Router({ mergeParams: true });

brandsRouter.use(requireCompanyMember("VIEWER"));

const brandSchema = z.object({ name: z.string().min(1) });

brandsRouter.get("/brands", async (req: CompanyScopedRequest, res) => {
  const brands = await prisma.brand.findMany({
    where: { companyId: req.companyId! },
    orderBy: { name: "asc" },
  });
  res.json(brands);
});

brandsRouter.post("/brands", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const brand = await prisma.brand.create({
    data: { companyId: req.companyId!, name: parsed.data.name.trim() },
  });
  res.status(201).json(brand);
});

brandsRouter.patch("/brands/:id", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const brand = await prisma.brand.update({
    where: { id: req.params.id },
    data: { name: parsed.data.name.trim() },
  });
  res.json(brand);
});

brandsRouter.delete("/brands/:id", requireCompanyMember("ADMIN"), async (req: CompanyScopedRequest, res) => {
  await prisma.brand.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ── Brand Statement ───────────────────────────────────────────────────────────

brandsRouter.get("/brands/:brandId/statement", async (req: CompanyScopedRequest, res) => {
  const brand = await prisma.brand.findFirst({
    where: { id: req.params.brandId, companyId: req.companyId! },
  });
  if (!brand) return res.status(404).json({ error: "Brand not found" });

  const from     = typeof req.query.from     === "string" && req.query.from     ? new Date(req.query.from) : null;
  const to       = typeof req.query.to       === "string" && req.query.to       ? new Date(req.query.to + "T23:59:59") : null;
  const vendorId = typeof req.query.vendorId === "string" && req.query.vendorId ? req.query.vendorId : null;

  const purchaseItems = await prisma.purchaseItem.findMany({
    where: {
      product: { brandId: brand.id },
      purchase: {
        companyId: req.companyId!,
        status: { not: "CANCELLED" },
        ...(vendorId ? { vendorId } : {}),
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
    },
    include: {
      product: true,
      purchase: { include: { vendor: true } },
    },
    orderBy: { purchase: { date: "asc" } },
  });

  type Line = {
    id: string; date: Date; voucherNo: string; reference: string | null;
    type: string; description: string; vendor: string; debit: number; credit: number;
  };
  const lines: Line[] = [];

  for (const item of purchaseItems) {
    const total      = Number(item.quantity) * Number(item.unitCost);
    const label      = item.product?.name ?? item.description ?? "Purchase";
    const vch        = item.purchase.voucherNo ?? item.purchase.reference ?? `PUR-${item.purchase.id.slice(0, 8).toUpperCase()}`;
    const vendorName = item.purchase.vendor?.name ?? "—";
    const ref        = item.purchase.reference ?? null;
    lines.push({ id: item.id + "-c", date: item.purchase.date, voucherNo: vch, reference: ref, type: "Purchase", description: label, vendor: vendorName, debit: 0, credit: total });
    if (item.purchase.status === "PAID") {
      lines.push({ id: item.id + "-p", date: item.purchase.updatedAt, voucherNo: `PMT/${vch}`, reference: ref, type: "Payment", description: `Paid — ${label}`, vendor: vendorName, debit: total, credit: 0 });
    }
  }

  lines.sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = 0;
  const rows = lines.map((l) => {
    balance += l.credit - l.debit;
    return { ...l, balance };
  });

  const totalCredit = rows.reduce((s, l) => s + l.credit, 0);
  const totalDebit  = rows.reduce((s, l) => s + l.debit, 0);

  res.json({ brand, lines: rows, totalCredit, totalDebit, balance });
});
