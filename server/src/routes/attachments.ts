import express, { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";
import { logAudit } from "../lib/audit";

export const attachmentsRouter = Router({ mergeParams: true });

attachmentsRouter.use(requireCompanyMember("VIEWER"));

const isPkg = Boolean((process as any).pkg);
const uploadsRoot = isPkg
  ? path.join(path.dirname(process.execPath), "uploads")
  : path.join(__dirname, "../../uploads");

function companyUploadsDir(companyId: string): string {
  return path.join(uploadsRoot, companyId);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── POST /expenses/:expenseId/attachments ─────────────────────────────────
// Body: raw binary, Content-Type header = mime type, ?filename=name.ext
attachmentsRouter.post(
  "/expenses/:expenseId/attachments",
  requireCompanyMember("ACCOUNTANT"),
  express.raw({ limit: "20mb", type: "*/*" }),
  async (req: CompanyScopedRequest, res) => {
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.expenseId, companyId: req.companyId! },
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: "No file data received" });
    }

    const originalName = String(req.query.filename ?? "attachment").replace(/[^a-zA-Z0-9._\-]/g, "_");
    const ext          = path.extname(originalName) || "";
    const storedAs     = `${crypto.randomUUID()}${ext}`;
    const mimeType     = req.headers["content-type"]?.split(";")[0] ?? "application/octet-stream";
    const dir          = companyUploadsDir(req.companyId!);

    ensureDir(dir);
    fs.writeFileSync(path.join(dir, storedAs), body);

    const attachment = await prisma.attachment.create({
      data: {
        companyId: req.companyId!,
        expenseId: expense.id,
        filename:  originalName,
        storedAs,
        mimeType,
        sizeBytes: body.length,
      },
    });

    logAudit({
      companyId: req.companyId!,
      userId:    req.userId!,
      userEmail: req.userEmail!,
      action:    "CREATE",
      entity:    "Attachment",
      entityId:  attachment.id,
      entityRef: expense.voucherNo ?? expense.id,
      changes:   { filename: originalName, sizeBytes: body.length },
    });

    res.status(201).json(attachment);
  }
);

// ── POST /purchases/:purchaseId/attachments ───────────────────────────────
attachmentsRouter.post(
  "/purchases/:purchaseId/attachments",
  requireCompanyMember("ACCOUNTANT"),
  express.raw({ limit: "20mb", type: "*/*" }),
  async (req: CompanyScopedRequest, res) => {
    const purchase = await prisma.purchase.findFirst({
      where: { id: req.params.purchaseId, companyId: req.companyId! },
    });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: "No file data received" });
    }

    const originalName = String(req.query.filename ?? "attachment").replace(/[^a-zA-Z0-9._\-]/g, "_");
    const ext          = path.extname(originalName) || "";
    const storedAs     = `${crypto.randomUUID()}${ext}`;
    const mimeType     = req.headers["content-type"]?.split(";")[0] ?? "application/octet-stream";
    const dir          = companyUploadsDir(req.companyId!);

    ensureDir(dir);
    fs.writeFileSync(path.join(dir, storedAs), body);

    const attachment = await prisma.attachment.create({
      data: {
        companyId:  req.companyId!,
        purchaseId: purchase.id,
        filename:   originalName,
        storedAs,
        mimeType,
        sizeBytes: body.length,
      },
    });

    logAudit({
      companyId: req.companyId!,
      userId:    req.userId!,
      userEmail: req.userEmail!,
      action:    "CREATE",
      entity:    "Attachment",
      entityId:  attachment.id,
      entityRef: purchase.voucherNo ?? purchase.id,
      changes:   { filename: originalName, sizeBytes: body.length },
    });

    res.status(201).json(attachment);
  }
);

// ── GET /purchases/:purchaseId/attachments ────────────────────────────────
attachmentsRouter.get("/purchases/:purchaseId/attachments", async (req: CompanyScopedRequest, res) => {
  const purchase = await prisma.purchase.findFirst({
    where: { id: req.params.purchaseId, companyId: req.companyId! },
  });
  if (!purchase) return res.status(404).json({ error: "Purchase not found" });

  const attachments = await prisma.attachment.findMany({
    where: { purchaseId: purchase.id, companyId: req.companyId! },
    orderBy: { createdAt: "asc" },
  });
  res.json(attachments);
});

// ── POST /invoices/:invoiceId/attachments ─────────────────────────────────
attachmentsRouter.post(
  "/invoices/:invoiceId/attachments",
  requireCompanyMember("ACCOUNTANT"),
  express.raw({ limit: "20mb", type: "*/*" }),
  async (req: CompanyScopedRequest, res) => {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, companyId: req.companyId! },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: "No file data received" });
    }

    const originalName = String(req.query.filename ?? "attachment").replace(/[^a-zA-Z0-9._\-]/g, "_");
    const ext          = path.extname(originalName) || "";
    const storedAs     = `${crypto.randomUUID()}${ext}`;
    const mimeType     = req.headers["content-type"]?.split(";")[0] ?? "application/octet-stream";
    const dir          = companyUploadsDir(req.companyId!);

    ensureDir(dir);
    fs.writeFileSync(path.join(dir, storedAs), body);

    const attachment = await prisma.attachment.create({
      data: {
        companyId: req.companyId!,
        invoiceId: invoice.id,
        filename:  originalName,
        storedAs,
        mimeType,
        sizeBytes: body.length,
      },
    });

    logAudit({
      companyId: req.companyId!,
      userId:    req.userId!,
      userEmail: req.userEmail!,
      action:    "CREATE",
      entity:    "Attachment",
      entityId:  attachment.id,
      entityRef: invoice.number,
      changes:   { filename: originalName, sizeBytes: body.length },
    });

    res.status(201).json(attachment);
  }
);

// ── GET /invoices/:invoiceId/attachments ──────────────────────────────────
attachmentsRouter.get("/invoices/:invoiceId/attachments", async (req: CompanyScopedRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.invoiceId, companyId: req.companyId! },
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const attachments = await prisma.attachment.findMany({
    where: { invoiceId: invoice.id, companyId: req.companyId! },
    orderBy: { createdAt: "asc" },
  });
  res.json(attachments);
});

// ── GET /expenses/:expenseId/attachments ──────────────────────────────────
attachmentsRouter.get("/expenses/:expenseId/attachments", async (req: CompanyScopedRequest, res) => {
  const expense = await prisma.expense.findFirst({
    where: { id: req.params.expenseId, companyId: req.companyId! },
  });
  if (!expense) return res.status(404).json({ error: "Expense not found" });

  const attachments = await prisma.attachment.findMany({
    where: { expenseId: expense.id, companyId: req.companyId! },
    orderBy: { createdAt: "asc" },
  });
  res.json(attachments);
});

// ── GET /attachments/:attachmentId/file ───────────────────────────────────
attachmentsRouter.get("/attachments/:attachmentId/file", async (req: CompanyScopedRequest, res) => {
  const att = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, companyId: req.companyId! },
  });
  if (!att) return res.status(404).json({ error: "Attachment not found" });

  const filePath = path.join(companyUploadsDir(req.companyId!), att.storedAs);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });

  res.setHeader("Content-Type", att.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${att.filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── POST /attachments/:attachmentId/share — generate a public share link ──
attachmentsRouter.post(
  "/attachments/:attachmentId/share",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const att = await prisma.attachment.findFirst({
      where: { id: req.params.attachmentId, companyId: req.companyId! },
    });
    if (!att) return res.status(404).json({ error: "Attachment not found" });

    const token = att.shareToken ?? crypto.randomUUID();
    await prisma.attachment.update({ where: { id: att.id }, data: { shareToken: token } });
    res.json({ shareUrl: `https://app.dmxiaccounting.com/doc.html?t=${token}` });
  }
);

// ── DELETE /attachments/:attachmentId ────────────────────────────────────
attachmentsRouter.delete(
  "/attachments/:attachmentId",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const att = await prisma.attachment.findFirst({
      where: { id: req.params.attachmentId, companyId: req.companyId! },
    });
    if (!att) return res.status(404).json({ error: "Attachment not found" });

    const filePath = path.join(companyUploadsDir(req.companyId!), att.storedAs);
    try { fs.unlinkSync(filePath); } catch {}

    await prisma.attachment.delete({ where: { id: att.id } });

    logAudit({
      companyId: req.companyId!,
      userId:    req.userId!,
      userEmail: req.userEmail!,
      action:    "DELETE",
      entity:    "Attachment",
      entityId:  att.id,
      entityRef: att.filename,
    });

    res.json({ success: true });
  }
);
