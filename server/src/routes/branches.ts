import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export const branchesRouter = Router({ mergeParams: true });
branchesRouter.use(requireAuth);

// GET /branches — list (snapshot excluded for size)
branchesRouter.get("/branches", async (req: AuthedRequest, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { companyId: req.params.companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, url: true, lastSyncAt: true, createdAt: true },
    });
    res.json(branches);
  } catch (err) { next(err); }
});

// POST /branches — add branch connection
branchesRouter.post("/branches", async (req: AuthedRequest, res, next) => {
  try {
    const { name, url, secretKey } = req.body;
    if (!name || !url || !secretKey)
      return res.status(400).json({ error: "name, url, and secretKey are required." });
    const branch = await prisma.branch.create({
      data: { companyId: req.params.companyId, name, url: url.replace(/\/$/, ""), secretKey },
      select: { id: true, name: true, url: true, lastSyncAt: true, createdAt: true },
    });
    res.json(branch);
  } catch (err) { next(err); }
});

// POST /branches/:branchId/sync — pull data from branch
branchesRouter.post("/branches/:branchId/sync", async (req: AuthedRequest, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, companyId: req.params.companyId },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found." });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    try {
      response = await fetch(`${branch.url}/api/branch/export`, {
        headers: { "x-branch-secret": branch.secretKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: `Branch returned ${response.status}: ${text.slice(0, 200)}` });
    }

    const data = await response.json() as { branchName?: string };
    const updated = await prisma.branch.update({
      where: { id: branch.id },
      data: { lastSyncAt: new Date(), lastSnapshot: JSON.stringify(data) },
      select: { id: true, name: true, url: true, lastSyncAt: true, createdAt: true },
    });

    res.json({ ok: true, branch: updated, branchName: data.branchName ?? branch.name });
  } catch (err: any) {
    if (err?.name === "AbortError")
      return res.status(504).json({ error: "Branch did not respond within 20 seconds. Make sure it is online." });
    next(err);
  }
});

// GET /branches/:branchId/snapshot — return latest synced data
branchesRouter.get("/branches/:branchId/snapshot", async (req: AuthedRequest, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, companyId: req.params.companyId },
      select: { id: true, name: true, lastSyncAt: true, lastSnapshot: true },
    });
    if (!branch) return res.status(404).json({ error: "Branch not found." });
    if (!branch.lastSnapshot) return res.json({ companies: [], exportedAt: null });
    res.json(JSON.parse(branch.lastSnapshot));
  } catch (err) { next(err); }
});

// DELETE /branches/:branchId — remove branch connection
branchesRouter.delete("/branches/:branchId", async (req: AuthedRequest, res, next) => {
  try {
    await prisma.branch.deleteMany({
      where: { id: req.params.branchId, companyId: req.params.companyId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
