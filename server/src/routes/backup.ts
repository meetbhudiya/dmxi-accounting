import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { listBackups, runBackup, deleteBackup, restoreBackup, openBackupsFolder } from "../lib/backup";

export const backupRouter = Router();

backupRouter.use(requireAuth);

// Only Admin or Owner of any company may modify backups
async function isAdminOrOwner(userId: string): Promise<boolean> {
  const count = await prisma.companyMember.count({
    where: { userId, role: { in: ["ADMIN", "OWNER"] } },
  });
  return count > 0;
}

// GET /api/backups — list all backups (any authenticated user can view)
backupRouter.get("/", async (_req, res, next) => {
  try {
    res.json(listBackups());
  } catch (err) { next(err); }
});

// POST /api/backups/now — run backup immediately (Admin/Owner only)
backupRouter.post("/now", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await isAdminOrOwner(req.userId!)))
      return res.status(403).json({ error: "Only Admins and Owners can run backups." });
    const entry = await runBackup();
    res.json(entry);
  } catch (err) { next(err); }
});

// POST /api/backups/open-folder — open backups folder in Explorer
backupRouter.post("/open-folder", async (_req, res, next) => {
  try {
    openBackupsFolder();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/backups/:filename/restore — restore a backup (Admin/Owner only)
backupRouter.post("/:filename/restore", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await isAdminOrOwner(req.userId!)))
      return res.status(403).json({ error: "Only Admins and Owners can restore backups." });
    restoreBackup(req.params.filename);
    res.json({ ok: true, message: "Database restored. Please restart DMXI to apply changes." });
  } catch (err) { next(err); }
});

// DELETE /api/backups/:filename — delete a backup (Admin/Owner only)
backupRouter.delete("/:filename", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await isAdminOrOwner(req.userId!)))
      return res.status(403).json({ error: "Only Admins and Owners can delete backups." });
    deleteBackup(req.params.filename);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
