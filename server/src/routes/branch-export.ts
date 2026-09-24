import { Router } from "express";
import { getBranchConfig, saveBranchConfig } from "../lib/branchConfig";
import { prisma } from "../lib/prisma";

export const branchExportRouter = Router();

// GET /api/branch/info — public, for connectivity test
branchExportRouter.get("/branch/info", (_req, res) => {
  const config = getBranchConfig();
  res.json({ branchId: config.branchId, branchName: config.branchName, dmxi: true, version: "1.2" });
});

// GET /api/branch/export — requires X-Branch-Secret header
branchExportRouter.get("/branch/export", async (req, res, next) => {
  try {
    const config = getBranchConfig();
    const secret = req.headers["x-branch-secret"] as string | undefined;
    if (!secret || secret !== config.secretKey) {
      return res.status(401).json({ error: "Invalid or missing branch secret." });
    }

    const companies = await prisma.company.findMany({
      include: {
        invoices: {
          include: { items: true, payments: true, customer: true },
          orderBy: { createdAt: "desc" },
        },
        expenses: { include: { vendor: true }, orderBy: { date: "desc" } },
        customers: { orderBy: { name: "asc" } },
        vendors: { orderBy: { name: "asc" } },
        products: { orderBy: { name: "asc" } },
        purchases: { include: { items: true, vendor: true }, orderBy: { date: "desc" } },
      },
    });

    res.json({
      branchId: config.branchId,
      branchName: config.branchName,
      exportedAt: new Date().toISOString(),
      companies,
    });
  } catch (err) { next(err); }
});

// PATCH /api/branch/config — update branch name (requires secret)
branchExportRouter.patch("/branch/config", (req, res, next) => {
  try {
    const config = getBranchConfig();
    const secret = req.headers["x-branch-secret"] as string | undefined;
    if (!secret || secret !== config.secretKey) {
      return res.status(401).json({ error: "Invalid or missing branch secret." });
    }
    const updated = saveBranchConfig({ branchName: req.body.branchName });
    res.json(updated);
  } catch (err) { next(err); }
});
