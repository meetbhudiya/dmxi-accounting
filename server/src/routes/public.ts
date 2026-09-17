import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";

export const publicRouter = Router();

// Public invoice view — no auth required, accessed via shareToken
publicRouter.get("/public/invoices/:token", async (req, res) => {
  const { token } = req.params;
  const invoice = await prisma.invoice.findUnique({
    where: { shareToken: token },
    include: {
      customer: true,
      items: true,
      payments: { where: { isVoided: false } },
      company: { select: { name: true } },
    },
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found or link has expired." });

  const subtotal = invoice.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  const discountAmt = subtotal * (Number(invoice.discountPercent) / 100);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = afterDiscount * (Number(invoice.vatPercent) / 100);
  const total = afterDiscount + vatAmt;
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);

  res.json({
    companyName: invoice.company.name,
    number: invoice.number,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    reference: invoice.reference,
    vatPercent: Number(invoice.vatPercent),
    discountPercent: Number(invoice.discountPercent),
    customer: {
      name: invoice.customer.name,
      email: invoice.customer.email,
      phone: invoice.customer.phone,
      address: invoice.customer.address,
    },
    items: invoice.items.map(i => ({
      description: i.description,
      product: i.product,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.quantity) * Number(i.unitPrice),
    })),
    subtotal,
    discountAmount: discountAmt,
    vatAmount: vatAmt,
    total,
    amountPaid: paid,
    amountDue: Math.max(0, total - paid),
  });
});

// Public attachment view — no auth required, accessed via shareToken
publicRouter.get("/public/attachments/:token", async (req, res) => {
  const { token } = req.params;
  const att = await prisma.attachment.findUnique({ where: { shareToken: token } });
  if (!att) return res.status(404).json({ error: "Document not found or link has expired." });

  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const filePath = path.join(uploadDir, att.storedAs);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk." });

  res.setHeader("Content-Type", att.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${att.filename}"`);
  fs.createReadStream(filePath).pipe(res);
});
