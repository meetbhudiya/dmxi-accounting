import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";
import { buildExportBundle } from "../lib/buildExportBundle";
import { runSync, scheduleCompany } from "../lib/autoSync";

export const syncRouter = Router({ mergeParams: true });

syncRouter.use(requireCompanyMember("VIEWER"));

// ─── EXPORT ─────────────────────────────────────────────────────────────────
syncRouter.get("/export", async (req: CompanyScopedRequest, res) => {
  const companyId = req.companyId!;
  const bundle = await buildExportBundle(companyId);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const safeName = (company?.name ?? "branch").replace(/[^a-zA-Z0-9]/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="dmxi-sync-${safeName}-${date}.dmxi"`);
  res.setHeader("Content-Type", "application/json");
  res.json(bundle);
});

// ─── IMPORT ─────────────────────────────────────────────────────────────────
syncRouter.post("/import", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res, next) => {
  try {
  const companyId = req.companyId!;
  const bundle = req.body as any;

  if (!bundle?.version || !bundle?.sourceCompanyId || !bundle?.data) {
    return res.status(400).json({ error: "Invalid bundle: missing version, sourceCompanyId, or data" });
  }

  const { sourceCompanyId, sourceBranchName, data } = bundle;

  const counts = {
    customers:  { imported: 0, skipped: 0 },
    vendors:    { imported: 0, skipped: 0 },
    products:   { imported: 0, skipped: 0 },
    invoices:   { imported: 0, skipped: 0 },
    payments:   { imported: 0, skipped: 0 },
    expenses:   { imported: 0, skipped: 0 },
    purchases:  { imported: 0, skipped: 0 },
  };

  const customerMap: Record<string, string> = {};
  const vendorMap:   Record<string, string> = {};
  const productMap:  Record<string, string> = {};
  const invoiceMap:  Record<string, string> = {};

  // ── Customers ──────────────────────────────────────────────────────────
  for (const c of data.customers ?? []) {
    const match = await prisma.customer.findFirst({
      where: { companyId, name: c.name },
    });
    if (match) {
      customerMap[c.id] = match.id;
      counts.customers.skipped++;
    } else {
      const created = await prisma.customer.create({
        data: { companyId, name: c.name, email: c.email ?? null, phone: c.phone ?? null, address: c.address ?? null },
      });
      customerMap[c.id] = created.id;
      counts.customers.imported++;
    }
  }

  // ── Vendors ────────────────────────────────────────────────────────────
  for (const v of data.vendors ?? []) {
    const match = await prisma.vendor.findFirst({
      where: { companyId, name: v.name },
    });
    if (match) {
      vendorMap[v.id] = match.id;
      counts.vendors.skipped++;
    } else {
      const created = await prisma.vendor.create({
        data: { companyId, name: v.name, email: v.email ?? null, phone: v.phone ?? null, address: v.address ?? null },
      });
      vendorMap[v.id] = created.id;
      counts.vendors.imported++;
    }
  }

  // ── Products ───────────────────────────────────────────────────────────
  for (const p of data.products ?? []) {
    const match = await prisma.product.findFirst({
      where: { companyId, name: p.name },
    });
    if (match) {
      productMap[p.id] = match.id;
      counts.products.skipped++;
    } else {
      const created = await prisma.product.create({
        data: {
          companyId,
          name: p.name,
          description: p.description ?? null,
          unitPrice: p.unitPrice,
          unit: p.unit ?? null,
          isActive: p.isActive ?? true,
          stockQty: p.stockQty ?? 0,
          reorderLevel: p.reorderLevel ?? 0,
        },
      });
      productMap[p.id] = created.id;
      counts.products.imported++;
    }
  }

  // ── Invoices ───────────────────────────────────────────────────────────
  for (const inv of data.invoices ?? []) {
    const externalId = `${sourceCompanyId}:${inv.id}`;
    const existing = await prisma.invoice.findFirst({ where: { companyId, externalId } });
    if (existing) {
      invoiceMap[inv.id] = existing.id;
      counts.invoices.skipped++;
      continue;
    }

    const hqCustomerId = customerMap[inv.customerId];
    if (!hqCustomerId) { counts.invoices.skipped++; continue; }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { invoiceSeq: { increment: 1 } },
    });
    const newNumber = `INV-${String(updated.invoiceSeq).padStart(4, "0")}`;

    const created = await prisma.invoice.create({
      data: {
        companyId,
        customerId: hqCustomerId,
        number: newNumber,
        status: inv.status,
        issueDate: new Date(inv.issueDate),
        dueDate: new Date(inv.dueDate),
        notes: inv.notes ?? null,
        discountPercent: inv.discountPercent ?? 0,
        vatPercent: inv.vatPercent ?? 0,
        reference: `[${sourceBranchName}] ${inv.number}`,
        externalId,
        items: {
          create: (inv.items ?? []).map((item: any) => ({
            product: item.product ?? null,
            description: item.description ?? "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
    });
    invoiceMap[inv.id] = created.id;
    counts.invoices.imported++;
  }

  // ── Payments ───────────────────────────────────────────────────────────
  for (const pmt of data.payments ?? []) {
    const externalId = `${sourceCompanyId}:${pmt.id}`;
    const existing = await prisma.payment.findFirst({ where: { externalId } });
    if (existing) { counts.payments.skipped++; continue; }

    const hqInvoiceId = invoiceMap[pmt.invoiceId];
    if (!hqInvoiceId) { counts.payments.skipped++; continue; }

    await prisma.payment.create({
      data: {
        invoiceId: hqInvoiceId,
        amount: pmt.amount,
        date: new Date(pmt.date),
        method: pmt.method ?? null,
        notes: pmt.notes ?? null,
        isVoided: pmt.isVoided ?? false,
        externalId,
      },
    });
    counts.payments.imported++;
  }

  // ── Expenses ───────────────────────────────────────────────────────────
  for (const exp of data.expenses ?? []) {
    const externalId = `${sourceCompanyId}:${exp.id}`;
    const existing = await prisma.expense.findFirst({ where: { companyId, externalId } });
    if (existing) { counts.expenses.skipped++; continue; }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { expenseSeq: { increment: 1 } },
    });
    const newVoucherNo = `EXP-${String(updated.expenseSeq).padStart(4, "0")}`;

    await prisma.expense.create({
      data: {
        companyId,
        vendorId: exp.vendorId ? (vendorMap[exp.vendorId] ?? null) : null,
        category: exp.category,
        description: exp.description ?? null,
        amount: exp.amount,
        date: new Date(exp.date),
        status: exp.status,
        voucherNo: newVoucherNo,
        reference: `[${sourceBranchName}] ${exp.voucherNo ?? exp.reference ?? ""}`.trim(),
        cancelledAt: exp.cancelledAt ? new Date(exp.cancelledAt) : null,
        cancelReason: exp.cancelReason ?? null,
        externalId,
      },
    });
    counts.expenses.imported++;
  }

  // ── Purchases ──────────────────────────────────────────────────────────
  for (const pur of data.purchases ?? []) {
    const externalId = `${sourceCompanyId}:${pur.id}`;
    const existing = await prisma.purchase.findFirst({ where: { companyId, externalId } });
    if (existing) { counts.purchases.skipped++; continue; }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { purchaseSeq: { increment: 1 } },
    });
    const newVoucherNo = `PUR-${String(updated.purchaseSeq).padStart(4, "0")}`;

    const syncItems = (pur.items && pur.items.length > 0)
      ? pur.items
      : [{ productId: pur.productId, description: pur.description, quantity: pur.quantity, unitCost: pur.unitCost }];

    await prisma.purchase.create({
      data: {
        companyId,
        vendorId: pur.vendorId ? (vendorMap[pur.vendorId] ?? null) : null,
        date: new Date(pur.date),
        status: pur.status,
        voucherNo: newVoucherNo,
        reference: `[${sourceBranchName}] ${pur.voucherNo ?? pur.reference ?? ""}`.trim(),
        cancelledAt: pur.cancelledAt ? new Date(pur.cancelledAt) : null,
        cancelReason: pur.cancelReason ?? null,
        externalId,
        items: {
          create: syncItems.map((it: any) => ({
            productId:   it.productId ? (productMap[it.productId] ?? null) : null,
            description: it.description ?? null,
            quantity:    it.quantity,
            unitCost:    it.unitCost,
          })),
        },
      },
    });
    counts.purchases.imported++;
  }

  res.json({
    success: true,
    sourceBranch: sourceBranchName,
    importedAt: new Date().toISOString(),
    counts,
  });
  } catch (err) { next(err); }
});

// ─── AUTO-SYNC CONFIG ────────────────────────────────────────────────────────

syncRouter.get("/auto-config", requireCompanyMember("ADMIN"), async (req: CompanyScopedRequest, res) => {
  const config = await prisma.syncConfig.findUnique({ where: { companyId: req.companyId! } });
  if (!config) return res.json(null);
  const { hqPassword: _pw, ...safe } = config;
  res.json({ ...safe, hqPasswordSet: !!_pw });
});

const syncConfigSchema = z.object({
  hqUrl:           z.string().url("Must be a valid URL (include https://)"),
  hqCompanyId:     z.string().min(1, "HQ Company ID is required"),
  hqEmail:         z.string().email(),
  hqPassword:      z.string().min(1).optional(),
  intervalMinutes: z.number().int().min(15).max(1440).default(60),
  enabled:         z.boolean().default(false),
});

syncRouter.patch("/auto-config", requireCompanyMember("ADMIN"), async (req: CompanyScopedRequest, res) => {
  const parsed = syncConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const companyId = req.companyId!;
  const { hqPassword, ...rest } = parsed.data;

  const existing = await prisma.syncConfig.findUnique({ where: { companyId } });

  const data: any = { ...rest };
  if (hqPassword) data.hqPassword = hqPassword;
  else if (!existing) data.hqPassword = "";

  const config = await prisma.syncConfig.upsert({
    where: { companyId },
    update: data,
    create: { companyId, ...data, hqPassword: hqPassword ?? "" },
  });

  scheduleCompany(config);

  const { hqPassword: _pw, ...safe } = config;
  res.json({ ...safe, hqPasswordSet: !!_pw });
});

// ─── MANUAL TRIGGER ─────────────────────────────────────────────────────────

syncRouter.post("/trigger", requireCompanyMember("ADMIN"), async (req: CompanyScopedRequest, res) => {
  const result = await runSync(req.companyId!).catch((err) => ({
    status: `error: ${err instanceof Error ? err.message : String(err)}`,
    at: new Date(),
  }));
  res.json(result);
});
