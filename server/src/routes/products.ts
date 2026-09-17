import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";
import { logAudit } from "../lib/audit";

export const productsRouter = Router({ mergeParams: true });

productsRouter.use(requireCompanyMember("VIEWER"));

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional().nullable(),
  description: z.string().optional(),
  brandId: z.string().optional().nullable(),
  unitPrice: z.number().nonnegative(),
  unit: z.string().optional(),
  isActive: z.boolean().optional(),
  stockQty: z.number().nonnegative().optional(),
  reorderLevel: z.number().nonnegative().optional(),
});

const productInclude = { brand: true };

productsRouter.get("/products", async (req: CompanyScopedRequest, res) => {
  const products = await prisma.product.findMany({
    where: { companyId: req.companyId!, isActive: true },
    include: productInclude,
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });
  res.json(products);
});

productsRouter.get("/products/all", async (req: CompanyScopedRequest, res) => {
  const products = await prisma.product.findMany({
    where: { companyId: req.companyId! },
    include: productInclude,
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
  });
  res.json(products);
});

productsRouter.post(
  "/products",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const product = await prisma.product.create({
        data: { companyId: req.companyId!, ...parsed.data },
        include: productInclude,
      });
      logAudit({
        companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
        action: "CREATE", entity: "Product", entityId: product.id, entityRef: product.name,
        changes: { name: product.name, unitPrice: Number(product.unitPrice) },
      });
      res.status(201).json(product);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "A product with this name already exists under this brand" });
      }
      throw err;
    }
  }
);

// ── Stock report ────────────────────────────────────────────────────────────
productsRouter.get("/stock-report", async (req: CompanyScopedRequest, res) => {
  const products = await prisma.product.findMany({
    where: { companyId: req.companyId! },
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    include: {
      brand: true,
      purchaseItems: {
        where: { purchase: { status: { not: "CANCELLED" } } },
        select: { quantity: true, unitCost: true },
      },
    },
  });

  const rows = products.map((p) => {
    const totalPurchased = p.purchaseItems.reduce(
      (sum: number, pu: { quantity: unknown }) => sum + Number(pu.quantity), 0
    );
    const available = Number(p.stockQty) + totalPurchased;
    const avgCost = p.purchaseItems.length
      ? p.purchaseItems.reduce((sum: number, pu: { unitCost: unknown; quantity: unknown }) => sum + Number(pu.unitCost) * Number(pu.quantity), 0) /
        p.purchaseItems.reduce((sum: number, pu: { quantity: unknown }) => sum + Number(pu.quantity), 0)
      : Number(p.unitPrice);
    const stockValue = available * avgCost;
    return {
      id: p.id,
      name: p.name,
      brand: p.brand?.name ?? null,
      description: p.description,
      unit: p.unit,
      unitPrice: Number(p.unitPrice),
      openingStock: Number(p.stockQty),
      totalPurchased,
      available,
      reorderLevel: Number(p.reorderLevel),
      stockValue,
      isActive: p.isActive,
    };
  });

  res.json(rows);
});

// ── Stock count (bulk calibration + history) ────────────────────────────────
productsRouter.post(
  "/stock-count",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const schema = z.object({
      countDate: z.string(),
      note: z.string().optional(),
      items: z.array(z.object({
        productId:      z.string(),
        productName:    z.string(),
        brand:          z.string().nullable().optional(),
        unit:           z.string().nullable().optional(),
        systemQty:      z.number(),
        countedQty:     z.number().nonnegative(),
        variance:       z.number(),
        unitPrice:      z.number().nonnegative(),
        totalPurchased: z.number().nonnegative(),
      })),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Persist the full count snapshot
    const stockCount = await prisma.stockCount.create({
      data: {
        companyId: req.companyId!,
        countDate: new Date(parsed.data.countDate),
        note: parsed.data.note,
        createdBy: req.userEmail!,
        items: {
          create: parsed.data.items.map((item) => ({
            productId:   item.productId,
            productName: item.productName,
            brand:       item.brand ?? null,
            unit:        item.unit ?? null,
            systemQty:   item.systemQty,
            countedQty:  item.countedQty,
            variance:    item.variance,
            unitPrice:   item.unitPrice,
          })),
        },
      },
    });

    // Only adjust stock for items with a variance
    const changedItems = parsed.data.items.filter((i) => i.variance !== 0);
    const updates = await Promise.all(
      changedItems.map(async ({ productId, countedQty, totalPurchased, productName }) => {
        const product = await prisma.product.findFirst({
          where: { id: productId, companyId: req.companyId! },
        });
        if (!product) return null;
        const newStockQty = Math.max(0, countedQty - totalPurchased);
        const updated = await prisma.product.update({
          where: { id: productId },
          data: { stockQty: newStockQty },
        });
        logAudit({
          companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
          action: "UPDATE", entity: "Product", entityId: productId, entityRef: productName,
          changes: {
            stockCount: { before: Number(product.stockQty) + totalPurchased, after: countedQty },
            stockCountId: stockCount.id,
            note: parsed.data.note,
          },
        });
        return updated;
      })
    );

    res.json({ id: stockCount.id, updated: updates.filter(Boolean).length });
  }
);

// ── Stock count history ──────────────────────────────────────────────────────
productsRouter.get("/stock-counts", async (req: CompanyScopedRequest, res) => {
  const counts = await prisma.stockCount.findMany({
    where: { companyId: req.companyId! },
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: [{ brand: "asc" }, { productName: "asc" }] },
    },
    take: 100,
  });
  res.json(counts);
});

// ── Bulk import ──────────────────────────────────────────────────────────────
productsRouter.post(
  "/products/bulk-import",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const rowSchema = z.object({
      name:         z.string().min(1),
      sku:          z.string().optional(),
      brandName:    z.string().optional(),
      description:  z.string().optional(),
      unitPrice:    z.number().nonnegative(),
      unit:         z.string().optional(),
      stockQty:     z.number().nonnegative().optional(),
      reorderLevel: z.number().nonnegative().optional(),
    });
    const schema = z.object({ products: z.array(rowSchema).min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const companyId = req.companyId!;
    const brandCache: Record<string, string> = {};

    let created = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < parsed.data.products.length; i++) {
      const row = parsed.data.products[i];
      try {
        let brandId: string | null = null;
        if (row.brandName?.trim()) {
          const key = row.brandName.trim().toLowerCase();
          if (!brandCache[key]) {
            const brand = await prisma.brand.upsert({
              where:  { companyId_name: { companyId, name: row.brandName.trim() } },
              update: {},
              create: { companyId, name: row.brandName.trim() },
            });
            brandCache[key] = brand.id;
          }
          brandId = brandCache[key];
        }

        await prisma.product.create({
          data: {
            companyId,
            name:         row.name.trim(),
            sku:          row.sku?.trim() || undefined,
            brandId,
            description:  row.description?.trim() || undefined,
            unitPrice:    row.unitPrice,
            unit:         row.unit?.trim() || undefined,
            stockQty:     row.stockQty ?? 0,
            reorderLevel: row.reorderLevel ?? 0,
          },
        });
        created++;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          skipped++;
        } else {
          errors.push({ row: i + 2, message: err instanceof Error ? err.message : "Unknown error" });
        }
      }
    }

    res.json({ created, skipped, errors });
  }
);

productsRouter.patch(
  "/products/:productId",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = productSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, companyId: req.companyId! },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: parsed.data,
      include: productInclude,
    });
    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: "UPDATE", entity: "Product", entityId: product.id, entityRef: product.name,
      changes: { before: { name: product.name, unitPrice: Number(product.unitPrice) }, after: parsed.data },
    });
    res.json(updated);
  }
);
