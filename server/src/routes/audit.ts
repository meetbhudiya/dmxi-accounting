import { Router } from "express";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";

export const auditRouter = Router({ mergeParams: true });

auditRouter.use(requireCompanyMember("VIEWER"));

// GET /audit?entity=Expense&action=DELETE&page=1
auditRouter.get("/audit", async (req: CompanyScopedRequest, res) => {
  const entity = typeof req.query.entity === "string" ? req.query.entity : undefined;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const page   = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const take   = 50;
  const skip   = (page - 1) * take;

  const where = {
    companyId: req.companyId!,
    ...(entity ? { entity } : {}),
    ...(action ? { action } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, total, page, pages: Math.ceil(total / take) });
});
