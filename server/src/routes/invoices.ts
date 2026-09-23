import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";
import { postJournal } from "../lib/accounting";
import { logAudit } from "../lib/audit";

export const invoicesRouter = Router({ mergeParams: true });

invoicesRouter.use(requireCompanyMember("VIEWER"));

// ---------- Customers ----------

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  kraPin: z.string().optional(),
});

invoicesRouter.get("/customers", async (req: CompanyScopedRequest, res) => {
  const customers = await prisma.customer.findMany({
    where: { companyId: req.companyId! },
    orderBy: { name: "asc" },
  });
  res.json(customers);
});

invoicesRouter.post("/customers", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const duplicate = await prisma.customer.findFirst({
    where: { companyId: req.companyId!, name: parsed.data.name },
  });
  if (duplicate) return res.status(409).json({ error: `A customer named "${duplicate.name}" already exists.` });

  const customer = await prisma.customer.create({
    data: { companyId: req.companyId!, ...parsed.data },
  });
  res.status(201).json(customer);
});

invoicesRouter.patch("/customers/:customerId", requireCompanyMember("ADMIN"), async (req: CompanyScopedRequest, res) => {
  const { customerId } = req.params;
  const existing = await prisma.customer.findFirst({ where: { id: customerId, companyId: req.companyId! } });
  if (!existing) return res.status(404).json({ error: "Customer not found" });

  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: parsed.data,
  });
  res.json(updated);
});

// ---------- Invoices ----------

const invoiceItemSchema = z.object({
  product: z.string().optional(),
  description: z.string().default(""),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
});

const invoiceSchema = z.object({
  customerId: z.string().uuid(),
  number: z.string().optional(),       // omit to auto-generate
  status: z.enum(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]).optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  notes: z.string().optional(),
  reference: z.string().optional(),
  discountPercent: z.number().min(0).max(100).default(0),
  vatPercent: z.number().min(0).max(100).default(0),
  items: z.array(invoiceItemSchema).min(1),
});

function invoiceTotal(items: { quantity: Prisma.Decimal | number; unitPrice: Prisma.Decimal | number }[]) {
  return items.reduce((sum, item) => {
    const qty = new Prisma.Decimal(item.quantity);
    const price = new Prisma.Decimal(item.unitPrice);
    return sum.plus(qty.times(price));
  }, new Prisma.Decimal(0));
}

function serializeInvoice(invoice: any) {
  const subtotal      = invoiceTotal(invoice.items);
  const discountPct   = new Prisma.Decimal(invoice.discountPercent ?? 0);
  const vatPct        = new Prisma.Decimal(invoice.vatPercent ?? 0);
  const discountAmount = subtotal.times(discountPct).div(100);
  const afterDiscount  = subtotal.minus(discountAmount);
  const vatAmount      = afterDiscount.times(vatPct).div(100);
  const grandTotal     = afterDiscount.plus(vatAmount);
  const paid = (invoice.payments ?? [])
    .filter((p: any) => !p.isVoided)
    .reduce(
      (sum: Prisma.Decimal, p: any) => sum.plus(p.amount),
      new Prisma.Decimal(0)
    );
  const creditNoteTotal = (invoice.creditNotes ?? []).reduce(
    (sum: Prisma.Decimal, cn: any) => sum.plus(cn.amount),
    new Prisma.Decimal(0)
  );
  const totalDeducted = paid.plus(creditNoteTotal);
  return {
    ...invoice,
    subtotal,
    discountAmount,
    vatAmount,
    grandTotal,
    amountPaid:      paid,
    creditNoteTotal,
    balanceDue:      grandTotal.minus(totalDeducted).lessThan(0)
      ? new Prisma.Decimal(0)
      : grandTotal.minus(totalDeducted),
  };
}

const INVOICE_INCLUDE = { customer: true, items: true, payments: true, creditNotes: true };

invoicesRouter.get("/invoices", async (req: CompanyScopedRequest, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { companyId: req.companyId! },
    include: INVOICE_INCLUDE,
    orderBy: { issueDate: "desc" },
  });
  res.json(invoices.map(serializeInvoice));
});

invoicesRouter.get("/invoices/:invoiceId", async (req: CompanyScopedRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.invoiceId, companyId: req.companyId! },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json(serializeInvoice(invoice));
});

// Generate / retrieve a public share link for an invoice
invoicesRouter.post("/invoices/:invoiceId/share", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.invoiceId, companyId: req.companyId! },
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const token = invoice.shareToken ?? crypto.randomUUID();
  await prisma.invoice.update({ where: { id: invoice.id }, data: { shareToken: token } });
  res.json({ shareUrl: `https://app.dmxiaccounting.com/i.html?t=${token}` });
});

invoicesRouter.post("/invoices", requireCompanyMember("ACCOUNTANT"), async (req: CompanyScopedRequest, res) => {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { customerId, number, status, issueDate, dueDate, notes, reference, discountPercent, vatPercent, items } = parsed.data;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId: req.companyId! },
  });
                                                            if (!customer) return res.status(400).json({ error: "Customer not found for this company" });

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      let invoiceNumber = number;
      if (!invoiceNumber) {
        const updated = await tx.company.update({
          where: { id: req.companyId! },
          data: { invoiceSeq: { increment: 1 } },
          select: { invoiceSeq: true },
        });
        const year = new Date().getFullYear();
        invoiceNumber = `INV-${year}-${String(updated.invoiceSeq).padStart(4, "0")}`;
      }

      const inv = await tx.invoice.create({
        data: {
          companyId: req.companyId!,
          customerId,
          number: invoiceNumber,
          status: status ?? "DRAFT",
          issueDate,
          dueDate,
          notes,
          reference,
          discountPercent,
          vatPercent,
          items: { create: items },
        },
        include: { customer: true, items: true, payments: true },
      });

      // Compute financials for journal posting
      const subtotal      = invoiceTotal(inv.items);
      const discountAmt   = subtotal.times(new Prisma.Decimal(discountPercent)).div(100);
      const afterDiscount = subtotal.minus(discountAmt);
      const vatAmt        = afterDiscount.times(new Prisma.Decimal(vatPercent)).div(100);
      const grandTotal    = afterDiscount.plus(vatAmt);

      // DR Accounts Receivable / CR Sales Revenue (+CR VAT Payable if applicable)
      const journalLines = [
        { accountCode: "1100", debit: grandTotal,    description: `Invoice ${invoiceNumber}` },
        { accountCode: "4000", credit: afterDiscount, description: `Invoice ${invoiceNumber}` },
        ...(vatAmt.greaterThan(0)
          ? [{ accountCode: "2100", credit: vatAmt, description: `VAT on ${invoiceNumber}` }]
          : []),
      ];
      await postJournal(tx, req.companyId!, {
        date:      issueDate,
        memo:      `Invoice ${invoiceNumber} — ${customer.name}`,
        reference: invoiceNumber,
        lines:     journalLines,
      });

      return inv;
    });
    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: "CREATE", entity: "Invoice", entityId: invoice.id, entityRef: invoice.number,
      changes: { customer: customer.name, status: invoice.status ?? "DRAFT" },
    });
    res.status(201).json(serializeInvoice(invoice));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "An invoice with this number already exists" });
    }
    throw err;
  }
});

// ---------- Edit Invoice (Admin/Owner only) ----------

const editInvoiceSchema = z.object({
  customerId:      z.string().uuid(),
  issueDate:       z.coerce.date(),
  dueDate:         z.coerce.date(),
  reference:       z.string().optional().nullable(),
  notes:           z.string().optional().nullable(),
  discountPercent: z.number().min(0).max(100).default(0),
  vatPercent:      z.number().min(0).max(100).default(0),
  items:           z.array(invoiceItemSchema).min(1),
});

invoicesRouter.patch(
  "/invoices/:invoiceId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = editInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, companyId: req.companyId! },
      include: INVOICE_INCLUDE,
    });
    if (!existing) return res.status(404).json({ error: "Invoice not found" });
    if (existing.status === "VOID") return res.status(400).json({ error: "Cannot edit a voided invoice" });

    const customer = await prisma.customer.findFirst({
      where: { id: parsed.data.customerId, companyId: req.companyId! },
    });
    if (!customer) return res.status(400).json({ error: "Customer not found" });

    // Compute original amounts for journal reversal
    const origSubtotal    = invoiceTotal((existing as any).items);
    const origDiscount    = origSubtotal.times(new Prisma.Decimal(existing.discountPercent)).div(100);
    const origAfterDisc   = origSubtotal.minus(origDiscount);
    const origVat         = origAfterDisc.times(new Prisma.Decimal(existing.vatPercent)).div(100);
    const origGrandTotal  = origAfterDisc.plus(origVat);

    // Compute new amounts
    const newSubtotal   = invoiceTotal(parsed.data.items.map((it) => ({ quantity: it.quantity, unitPrice: it.unitPrice })));
    const newDiscount   = newSubtotal.times(new Prisma.Decimal(parsed.data.discountPercent)).div(100);
    const newAfterDisc  = newSubtotal.minus(newDiscount);
    const newVat        = newAfterDisc.times(new Prisma.Decimal(parsed.data.vatPercent)).div(100);
    const newGrandTotal = newAfterDisc.plus(newVat);

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Reverse original journal (only if amounts differ or dates differ)
      const reversalLines: { accountCode: string; debit?: number | Prisma.Decimal; credit?: number | Prisma.Decimal; description: string }[] = [
        { accountCode: "1100", credit: origGrandTotal, description: `Reversal — ${existing.number}` },
        { accountCode: "4000", debit: origAfterDisc,  description: `Reversal — ${existing.number}` },
        ...(origVat.greaterThan(0)
          ? [{ accountCode: "2100", debit: origVat, description: `VAT reversal — ${existing.number}` }]
          : []),
      ];
      await postJournal(tx, req.companyId!, {
        date:      existing.issueDate,
        memo:      `Edit reversal — Invoice ${existing.number}`,
        reference: existing.number,
        lines:     reversalLines,
      });

      // 2. Delete old items, create new ones, update header
      await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });

      const inv = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          customerId:      parsed.data.customerId,
          issueDate:       parsed.data.issueDate,
          dueDate:         parsed.data.dueDate,
          reference:       parsed.data.reference ?? null,
          notes:           parsed.data.notes ?? null,
          discountPercent: parsed.data.discountPercent,
          vatPercent:      parsed.data.vatPercent,
          items: { create: parsed.data.items },
        },
        include: INVOICE_INCLUDE,
      });

      // 3. Post new journal
      const newLines: { accountCode: string; debit?: number | Prisma.Decimal; credit?: number | Prisma.Decimal; description: string }[] = [
        { accountCode: "1100", debit: newGrandTotal,  description: `Invoice ${existing.number}` },
        { accountCode: "4000", credit: newAfterDisc,  description: `Invoice ${existing.number}` },
        ...(newVat.greaterThan(0)
          ? [{ accountCode: "2100", credit: newVat, description: `VAT on ${existing.number}` }]
          : []),
      ];
      await postJournal(tx, req.companyId!, {
        date:      parsed.data.issueDate,
        memo:      `Invoice ${existing.number} — ${customer.name} (edited)`,
        reference: existing.number,
        lines:     newLines,
      });

      // 4. Recompute status based on payments still present
      const s = serializeInvoice(inv);
      const nextStatus = s.balanceDue.lte(0) ? "PAID"
        : s.amountPaid.gt(0) || s.creditNoteTotal.gt(0) ? "PARTIALLY_PAID"
        : existing.status === "PAID" ? "SENT"
        : existing.status;

      return tx.invoice.update({
        where: { id: existing.id },
        data: { status: nextStatus },
        include: INVOICE_INCLUDE,
      });
    });

    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: "UPDATE", entity: "Invoice", entityId: existing.id, entityRef: existing.number,
      changes: { customer: customer.name, items: parsed.data.items.length },
    });

    res.json(serializeInvoice(updated));
  }
);

const statusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]),
});

invoicesRouter.patch(
  "/invoices/:invoiceId/status",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, companyId: req.companyId! },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: parsed.data.status },
      include: INVOICE_INCLUDE,
    });
    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: parsed.data.status === "VOID" ? "VOID" : "UPDATE",
      entity: "Invoice", entityId: invoice.id, entityRef: invoice.number,
      changes: { before: { status: invoice.status }, after: { status: parsed.data.status } },
    });
    res.json(serializeInvoice(updated));
  }
);

// ---------- Payments ----------

const paymentSchema = z.object({
  amount: z.number().positive(),
  date: z.coerce.date(),
  method: z.string().optional(),
  notes: z.string().optional(),
});

invoicesRouter.post(
  "/invoices/:invoiceId/payments",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, companyId: req.companyId! },
      include: { items: true, payments: true },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Compute grand total (with discount + VAT) to decide paid status
    const subtotal      = invoiceTotal(invoice.items);
    const discountAmt   = subtotal.times(new Prisma.Decimal(invoice.discountPercent)).div(100);
    const afterDiscount = subtotal.minus(discountAmt);
    const vatAmt        = afterDiscount.times(new Prisma.Decimal(invoice.vatPercent)).div(100);
    const grandTotal    = afterDiscount.plus(vatAmt);

    const alreadyPaid = invoice.payments.reduce(
      (sum, p) => sum.plus(p.amount),
      new Prisma.Decimal(0)
    );
    const newTotal = alreadyPaid.plus(parsed.data.amount);

    const nextStatus = newTotal.gte(grandTotal)
      ? "PAID"
      : newTotal.gt(0)
      ? "PARTIALLY_PAID"
      : invoice.status;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: { invoiceId: invoice.id, ...parsed.data },
      });

      // DR Cash / CR Accounts Receivable
      await postJournal(tx, req.companyId!, {
        date:      parsed.data.date,
        memo:      `Payment received — Invoice ${invoice.number}`,
        reference: invoice.number,
        lines: [
          { accountCode: "1000", debit:  parsed.data.amount, description: `Receipt for ${invoice.number}` },
          { accountCode: "1100", credit: parsed.data.amount, description: `Receipt for ${invoice.number}` },
        ],
      });

      return tx.invoice.update({
        where: { id: invoice.id },
        data:  { status: nextStatus },
        include: INVOICE_INCLUDE,
      });
    });

    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: "CREATE", entity: "Payment", entityId: invoice.id, entityRef: invoice.number,
      changes: { amount: parsed.data.amount, method: parsed.data.method },
    });
    res.status(201).json(serializeInvoice(updated));
  }
);

// ---------- Credit Notes ----------

const creditNoteSchema = z.object({
  amount: z.number().positive(),
  date:   z.coerce.date(),
  reason: z.string().optional(),
});

invoicesRouter.post(
  "/invoices/:invoiceId/credit-note",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = creditNoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findFirst({
      where:   { id: req.params.invoiceId, companyId: req.companyId! },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const current = serializeInvoice(invoice);
    if (new Prisma.Decimal(parsed.data.amount).gt(current.balanceDue)) {
      return res.status(400).json({
        error: `Credit note amount exceeds balance due (${current.balanceDue.toFixed(2)})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const co = await tx.company.update({
        where:  { id: req.companyId! },
        data:   { creditNoteSeq: { increment: 1 } },
        select: { creditNoteSeq: true },
      });
      const year   = new Date().getFullYear();
      const number = `CN-${year}-${String(co.creditNoteSeq).padStart(4, "0")}`;

      await tx.creditNote.create({
        data: {
          companyId: req.companyId!,
          invoiceId: invoice.id,
          number,
          amount: parsed.data.amount,
          date:   parsed.data.date,
          reason: parsed.data.reason,
        },
      });

      // DR Revenue (4000) — reverses sale / CR Accounts Receivable (1100) — reduces A/R
      await postJournal(tx, req.companyId!, {
        date:      parsed.data.date,
        memo:      `Credit Note ${number} — Invoice ${invoice.number}`,
        reference: number,
        lines: [
          { accountCode: "4000", debit:  parsed.data.amount, description: `CN against ${invoice.number}` },
          { accountCode: "1100", credit: parsed.data.amount, description: `CN against ${invoice.number}` },
        ],
      });

      // Re-fetch to compute new balance
      const fresh = await tx.invoice.findFirst({
        where:   { id: invoice.id },
        include: INVOICE_INCLUDE,
      });
      const s = serializeInvoice(fresh);

      let nextStatus = fresh!.status;
      if (nextStatus !== "VOID") {
        if (s.balanceDue.lte(0)) {
          nextStatus = "PAID";
        } else if (s.amountPaid.gt(0) || s.creditNoteTotal.gt(0)) {
          nextStatus = "PARTIALLY_PAID";
        }
      }

      return tx.invoice.update({
        where:   { id: invoice.id },
        data:    { status: nextStatus },
        include: INVOICE_INCLUDE,
      });
    });

    res.status(201).json(serializeInvoice(updated));
  }
);

// ---------- Void invoice ----------

const voidReasonSchema = z.object({ reason: z.string().optional() });

invoicesRouter.post(
  "/invoices/:invoiceId/void",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const { reason } = voidReasonSchema.parse(req.body);

    const invoice = await prisma.invoice.findFirst({
      where:   { id: req.params.invoiceId, companyId: req.companyId! },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "VOID") return res.status(400).json({ error: "Invoice already voided" });

    const s = serializeInvoice(invoice);

    const updated = await prisma.$transaction(async (tx) => {
      // Reverse the original invoice entry: DR Revenue / [DR VAT] / CR AR
      const reversalLines: { accountCode: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal; description: string }[] = [
        { accountCode: "4000", debit:  s.grandTotal.minus(s.vatAmount), description: `Void ${invoice.number}${reason ? ` — ${reason}` : ""}` },
        { accountCode: "1100", credit: s.grandTotal,                    description: `Void ${invoice.number}` },
      ];
      if (s.vatAmount.gt(0)) {
        reversalLines.splice(1, 0, { accountCode: "2100", debit: s.vatAmount, description: `Void VAT on ${invoice.number}` });
      }
      await postJournal(tx, req.companyId!, {
        date:      new Date(),
        memo:      `VOID Invoice ${invoice.number}${reason ? ` — ${reason}` : ""}`,
        reference: `VOID-${invoice.number}`,
        lines:     reversalLines,
      });

      // Reverse each non-voided payment
      for (const pmt of invoice.payments.filter((p: any) => !p.isVoided)) {
        await postJournal(tx, req.companyId!, {
          date:      new Date(),
          memo:      `Void payment on Invoice ${invoice.number}`,
          reference: `VOID-${invoice.number}`,
          lines: [
            { accountCode: "1100", debit:  pmt.amount, description: `Reverse receipt ${invoice.number}` },
            { accountCode: "1000", credit: pmt.amount, description: `Reverse receipt ${invoice.number}` },
          ],
        });
      }

      // Reverse each credit note
      for (const cn of (invoice as any).creditNotes ?? []) {
        await postJournal(tx, req.companyId!, {
          date:      new Date(),
          memo:      `Void credit note ${cn.number} on Invoice ${invoice.number}`,
          reference: `VOID-${invoice.number}`,
          lines: [
            { accountCode: "1100", debit:  cn.amount, description: `Reverse CN ${cn.number}` },
            { accountCode: "4000", credit: cn.amount, description: `Reverse CN ${cn.number}` },
          ],
        });
      }

      return tx.invoice.update({
        where:   { id: invoice.id },
        data:    { status: "VOID" },
        include: INVOICE_INCLUDE,
      });
    });

    res.json(serializeInvoice(updated));
  }
);

// ---------- Delete invoice (Admin/Owner only) ----------

invoicesRouter.delete(
  "/invoices/:invoiceId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const invoice = await prisma.invoice.findFirst({
      where:   { id: req.params.invoiceId, companyId: req.companyId! },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    await prisma.$transaction(async (tx) => {
      if (invoice.status !== "VOID") {
        const s = serializeInvoice(invoice);
        const reversalLines: { accountCode: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal; description: string }[] = [
          { accountCode: "4000", debit:  s.grandTotal.minus(s.vatAmount), description: `Delete ${invoice.number}` },
          { accountCode: "1100", credit: s.grandTotal,                    description: `Delete ${invoice.number}` },
        ];
        if (s.vatAmount.gt(0)) {
          reversalLines.splice(1, 0, { accountCode: "2100", debit: s.vatAmount, description: `Delete VAT ${invoice.number}` });
        }
        await postJournal(tx, req.companyId!, {
          date:      new Date(),
          memo:      `DELETED Invoice ${invoice.number}`,
          reference: `DEL-${invoice.number}`,
          lines:     reversalLines,
        });

        for (const pmt of invoice.payments.filter((p: any) => !p.isVoided)) {
          await postJournal(tx, req.companyId!, {
            date:      new Date(),
            memo:      `Delete payment on Invoice ${invoice.number}`,
            reference: `DEL-${invoice.number}`,
            lines: [
              { accountCode: "1100", debit:  pmt.amount, description: `Reverse receipt ${invoice.number}` },
              { accountCode: "1000", credit: pmt.amount, description: `Reverse receipt ${invoice.number}` },
            ],
          });
        }
      }
      // Cascade deletes items, payments, credit notes
      await tx.invoice.delete({ where: { id: invoice.id } });
    });

    res.json({ success: true });
  }
);

// ---------- Void payment ----------

invoicesRouter.post(
  "/invoices/:invoiceId/payments/:paymentId/void",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const voidNote: string | undefined = req.body.voidNote;

    const invoice = await prisma.invoice.findFirst({
      where:   { id: req.params.invoiceId, companyId: req.companyId! },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const payment = (invoice.payments as any[]).find((p) => p.id === req.params.paymentId);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.isVoided) return res.status(400).json({ error: "Payment already voided" });

    const updated = await prisma.$transaction(async (tx) => {
      await postJournal(tx, req.companyId!, {
        date:      new Date(),
        memo:      `VOID payment on Invoice ${invoice.number}${voidNote ? ` — ${voidNote}` : ""}`,
        reference: `VOID-PMT-${invoice.number}`,
        lines: [
          { accountCode: "1100", debit:  payment.amount, description: `Reverse payment ${invoice.number}` },
          { accountCode: "1000", credit: payment.amount, description: `Reverse payment ${invoice.number}` },
        ],
      });

      await tx.payment.update({
        where: { id: payment.id },
        data:  { isVoided: true, voidedAt: new Date(), voidNote },
      });

      // Recompute status
      const fresh = await tx.invoice.findFirst({
        where:   { id: invoice.id },
        include: INVOICE_INCLUDE,
      });
      const s = serializeInvoice(fresh);
      const nextStatus = s.balanceDue.lte(0) ? "PAID" :
        s.amountPaid.gt(0) || s.creditNoteTotal.gt(0) ? "PARTIALLY_PAID" :
        fresh!.status === "PAID" ? "SENT" : fresh!.status;

      return tx.invoice.update({
        where:   { id: invoice.id },
        data:    { status: nextStatus },
        include: INVOICE_INCLUDE,
      });
    });

    res.json(serializeInvoice(updated));
  }
);

// ---------- Delete payment (Admin/Owner only) ----------

invoicesRouter.delete(
  "/invoices/:invoiceId/payments/:paymentId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const invoice = await prisma.invoice.findFirst({
      where:   { id: req.params.invoiceId, companyId: req.companyId! },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const payment = (invoice.payments as any[]).find((p) => p.id === req.params.paymentId);
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    const updated = await prisma.$transaction(async (tx) => {
      if (!payment.isVoided) {
        await postJournal(tx, req.companyId!, {
          date:      new Date(),
          memo:      `DELETED payment on Invoice ${invoice.number}`,
          reference: `DEL-PMT-${invoice.number}`,
          lines: [
            { accountCode: "1100", debit:  payment.amount, description: `Delete payment ${invoice.number}` },
            { accountCode: "1000", credit: payment.amount, description: `Delete payment ${invoice.number}` },
          ],
        });
      }

      await tx.payment.delete({ where: { id: payment.id } });

      const fresh = await tx.invoice.findFirst({
        where:   { id: invoice.id },
        include: INVOICE_INCLUDE,
      });
      const s = serializeInvoice(fresh);
      const nextStatus = s.balanceDue.lte(0) ? "PAID" :
        s.amountPaid.gt(0) || s.creditNoteTotal.gt(0) ? "PARTIALLY_PAID" :
        fresh!.status === "PAID" ? "SENT" : fresh!.status;

      return tx.invoice.update({
        where:   { id: invoice.id },
        data:    { status: nextStatus },
        include: INVOICE_INCLUDE,
      });
    });

    res.json(serializeInvoice(updated));
  }
);

// ---------- List all payments ----------

invoicesRouter.get("/payments", async (req: CompanyScopedRequest, res) => {
  const payments = await prisma.payment.findMany({
    where: { invoice: { companyId: req.companyId! } },
    include: { invoice: { include: { customer: true, items: true } } },
    orderBy: { date: "desc" },
  });
  res.json(payments.map((p) => {
    const subtotal     = invoiceTotal(p.invoice.items);
    const discountPct  = new Prisma.Decimal(p.invoice.discountPercent ?? 0);
    const vatPct       = new Prisma.Decimal(p.invoice.vatPercent ?? 0);
    const afterDisc    = subtotal.minus(subtotal.times(discountPct).div(100));
    const grandTotal   = afterDisc.plus(afterDisc.times(vatPct).div(100));
    return {
      id:        p.id,
      invoiceId: p.invoiceId,
      amount:    p.amount.toString(),
      date:      p.date,
      method:    p.method,
      notes:     p.notes,
      isVoided:  p.isVoided,
      voidedAt:  p.voidedAt,
      voidNote:  p.voidNote,
      createdAt: p.createdAt,
      invoice: {
        id:         p.invoice.id,
        number:     p.invoice.number,
        reference:  p.invoice.reference ?? null,
        grandTotal: grandTotal.toFixed(2),
        customer:   { name: p.invoice.customer.name },
      },
    };
  }));
});

// ---------- Edit payment (Admin/Owner only) ----------

invoicesRouter.patch(
  "/invoices/:invoiceId/payments/:paymentId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const schema = z.object({
      amount: z.number().positive().optional(),
      date:   z.coerce.date().optional(),
      method: z.string().optional(),
      notes:  z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, companyId: req.companyId! },
      include: INVOICE_INCLUDE,
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const payment = (invoice.payments as any[]).find((p) => p.id === req.params.paymentId);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.isVoided) return res.status(400).json({ error: "Cannot edit a voided payment" });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data:  parsed.data,
      });
      const fresh = await tx.invoice.findFirst({
        where: { id: invoice.id }, include: INVOICE_INCLUDE,
      });
      const s = serializeInvoice(fresh);
      const nextStatus = s.balanceDue.lte(0) ? "PAID" :
        s.amountPaid.gt(0) || s.creditNoteTotal.gt(0) ? "PARTIALLY_PAID" :
        fresh!.status === "PAID" ? "SENT" : fresh!.status;
      return tx.invoice.update({
        where: { id: invoice.id }, data: { status: nextStatus }, include: INVOICE_INCLUDE,
      });
    });

    logAudit({
      companyId: req.companyId!, userId: req.userId!, userEmail: req.userEmail!,
      action: "UPDATE", entity: "Payment", entityId: payment.id,
      entityRef: invoice.number, changes: parsed.data,
    });

    res.json(serializeInvoice(updated));
  }
);

// ---------- Customer Statement (subsidiary ledger) ----------

invoicesRouter.get("/customers/:customerId/statement", async (req: CompanyScopedRequest, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.customerId, companyId: req.companyId! },
  });
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : null;
  const to   = typeof req.query.to   === "string" && req.query.to   ? new Date(req.query.to + "T23:59:59") : null;

  const invoices = await prisma.invoice.findMany({
    where: {
      customerId: customer.id,
      companyId: req.companyId!,
      ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: { items: true, payments: true },
    orderBy: { issueDate: "asc" },
  });

  type Line = {
    id: string; date: Date; voucherNo: string; reference: string | null;
    type: string; description: string; debit: number; credit: number;
  };
  const lines: Line[] = [];

  for (const inv of invoices) {
    const subtotal      = invoiceTotal(inv.items);
    const discountAmt   = subtotal.times(new Prisma.Decimal(inv.discountPercent)).div(100);
    const afterDiscount = subtotal.minus(discountAmt);
    const vatAmt        = afterDiscount.times(new Prisma.Decimal(inv.vatPercent)).div(100);
    const grandTotal    = Number(afterDiscount.plus(vatAmt));

    lines.push({
      id: inv.id,
      date: inv.issueDate,
      voucherNo: inv.number,
      reference: inv.reference ?? null,
      type: "Invoice",
      description: inv.notes ?? `Invoice to ${customer.name}`,
      debit: grandTotal,
      credit: 0,
    });

    for (const pmt of inv.payments) {
      lines.push({
        id: pmt.id,
        date: pmt.date,
        voucherNo: `RCP/${inv.number}`,
        reference: inv.reference ?? null,
        type: "Receipt",
        description: pmt.notes ?? `Payment — ${inv.number}`,
        debit: 0,
        credit: Number(pmt.amount),
      });
    }
  }

  lines.sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = 0;
  const rows = lines.map((l) => {
    balance += l.debit - l.credit;
    return { ...l, balance };
  });

  const totalDebit  = rows.reduce((s, l) => s + l.debit,  0);
  const totalCredit = rows.reduce((s, l) => s + l.credit, 0);

  res.json({ customer, lines: rows, totalDebit, totalCredit, balance });
});

// ---------- Email Invoice ----------

const emailSchema = z.object({
  recipientEmail: z.string().email().optional(),
  pdfBase64:      z.string().optional(),  // base64-encoded PDF from the client
  companyName:    z.string().optional(),
});

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT ? Number(SMTP_PORT) : 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  // Fall back to a throwaway Ethereal test account for dev
  return null;
}

function invoiceHtml(invoice: any, companyName: string): string {
  const fmt = (v: string | number) =>
    Number(v).toLocaleString("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 });
  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });

  const itemRows = (invoice.items ?? [])
    .map(
      (item: any) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${item.description ?? ""}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmt(item.unitPrice)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${fmt(Number(item.quantity) * Number(item.unitPrice))}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td colspan="2" style="background:#1e293b;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#fff;font-size:22px;font-weight:700;">${companyName}</td>
                <td align="right">
                  <span style="color:#fff;font-size:14px;font-weight:600;">${invoice.number}</span><br/>
                  <span style="display:inline-block;margin-top:4px;background:#2454ff;color:#fff;font-size:11px;font-weight:600;padding:3px 10px;border-radius:4px;">${invoice.status.replace(/_/g, " ")}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Bill to / dates -->
        <tr>
          <td style="padding:24px 32px 12px;vertical-align:top;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Bill To</div>
            <div style="font-size:15px;font-weight:700;color:#1e293b;">${invoice.customer?.name ?? ""}</div>
            ${invoice.customer?.email ? `<div style="color:#64748b;font-size:13px;">${invoice.customer.email}</div>` : ""}
            ${invoice.customer?.phone ? `<div style="color:#64748b;font-size:13px;">${invoice.customer.phone}</div>` : ""}
            ${invoice.customer?.address ? `<div style="color:#64748b;font-size:13px;">${invoice.customer.address}</div>` : ""}
          </td>
          <td style="padding:24px 32px 12px;vertical-align:top;text-align:right;">
            <table cellpadding="0" cellspacing="0" style="margin-left:auto;">
              <tr><td style="color:#64748b;font-size:12px;padding:2px 0;">Issue Date:</td><td style="padding:2px 0 2px 12px;font-size:12px;font-weight:600;">${fmtDate(invoice.issueDate)}</td></tr>
              <tr><td style="color:#64748b;font-size:12px;padding:2px 0;">Due Date:</td><td style="padding:2px 0 2px 12px;font-size:12px;font-weight:600;">${fmtDate(invoice.dueDate)}</td></tr>
              ${invoice.reference ? `<tr><td style="color:#64748b;font-size:12px;padding:2px 0;">Reference:</td><td style="padding:2px 0 2px 12px;font-size:12px;font-weight:600;">${invoice.reference}</td></tr>` : ""}
            </table>
          </td>
        </tr>
        <!-- Items table -->
        <tr><td colspan="2" style="padding:0 32px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#1e293b;">Description</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#1e293b;">Qty</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#1e293b;">Unit Price</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#1e293b;">Amount</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        </td></tr>
        <!-- Totals -->
        <tr><td colspan="2" style="padding:0 32px 24px;">
          <table cellpadding="0" cellspacing="0" style="margin-left:auto;min-width:240px;">
            <tr><td style="color:#64748b;font-size:13px;padding:3px 0;">Subtotal:</td><td style="padding:3px 0 3px 24px;font-size:13px;text-align:right;">${fmt(invoice.subtotal)}</td></tr>
            ${Number(invoice.discountAmount) > 0 ? `<tr><td style="color:#64748b;font-size:13px;padding:3px 0;">Discount (${invoice.discountPercent}%):</td><td style="padding:3px 0 3px 24px;font-size:13px;text-align:right;">- ${fmt(invoice.discountAmount)}</td></tr>` : ""}
            ${Number(invoice.vatAmount) > 0 ? `<tr><td style="color:#64748b;font-size:13px;padding:3px 0;">VAT (${invoice.vatPercent}%):</td><td style="padding:3px 0 3px 24px;font-size:13px;text-align:right;">${fmt(invoice.vatAmount)}</td></tr>` : ""}
            <tr style="background:#e8f0fe;border-radius:6px;">
              <td style="padding:10px 12px;font-size:15px;font-weight:700;color:#1e293b;">Grand Total:</td>
              <td style="padding:10px 12px;font-size:15px;font-weight:700;color:#2454ff;text-align:right;">${fmt(invoice.grandTotal)}</td>
            </tr>
            ${Number(invoice.amountPaid) > 0 ? `<tr><td style="color:#16a34a;font-size:12px;padding:3px 0;">Paid:</td><td style="padding:3px 0 3px 24px;font-size:12px;color:#16a34a;text-align:right;">${fmt(invoice.amountPaid)}</td></tr>
            <tr><td style="font-size:14px;font-weight:700;padding:4px 0;color:${Number(invoice.balanceDue) > 0 ? "#dc2626" : "#16a34a"};">Balance Due:</td><td style="font-size:14px;font-weight:700;padding:4px 0 4px 24px;text-align:right;color:${Number(invoice.balanceDue) > 0 ? "#dc2626" : "#16a34a"};">${fmt(invoice.balanceDue)}</td></tr>` : ""}
          </table>
        </td></tr>
        ${invoice.notes ? `<tr><td colspan="2" style="padding:0 32px 24px;color:#64748b;font-size:12px;"><strong>Notes:</strong> ${invoice.notes}</td></tr>` : ""}
        <!-- Footer -->
        <tr><td colspan="2" style="background:#f1f5f9;padding:16px 32px;text-align:center;color:#94a3b8;font-size:11px;">
          ${companyName} &nbsp;·&nbsp; This is a computer-generated invoice.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

invoicesRouter.post(
  "/invoices/:invoiceId/email",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, companyId: req.companyId! },
      include: { customer: true, items: true, payments: true },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const serialized = serializeInvoice(invoice);
    const to         = parsed.data.recipientEmail ?? invoice.customer.email;
    if (!to) return res.status(400).json({ error: "No email address on file for this customer. Please provide recipientEmail." });

    const companyName = parsed.data.companyName ?? "DMXI";
    const subject     = `Invoice ${invoice.number} from ${companyName}`;
    const html        = invoiceHtml(serialized, companyName);

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    if (parsed.data.pdfBase64) {
      attachments.push({
        filename:    `Invoice_${invoice.number}.pdf`,
        content:     Buffer.from(parsed.data.pdfBase64, "base64"),
        contentType: "application/pdf",
      });
    }

    let transport = createTransport();
    let previewUrl: string | undefined;
    let usingEthereal = false;

    if (!transport) {
      usingEthereal = true;
      const testAccount = await nodemailer.createTestAccount();
      transport = nodemailer.createTransport({
        host:   "smtp.ethereal.email",
        port:   587,
        secure: false,
        auth:   { user: testAccount.user, pass: testAccount.pass },
      });
    }

    try {
      const info = await transport.sendMail({
        from:    process.env.SMTP_FROM ?? `"${companyName}" <noreply@dmxi.app>`,
        to,
        subject,
        html,
        attachments,
      });

      previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

      res.json({
        message:     usingEthereal
          ? `Test email sent (Ethereal preview — not a real inbox). Configure SMTP_PASS in .env to send real emails.`
          : `Invoice ${invoice.number} emailed to ${to}`,
        messageId:   info.messageId,
        previewUrl,
      });
    } catch (mailErr: any) {
      console.error("Email send error:", mailErr);
      return res.status(500).json({
        error: `Email failed: ${mailErr.message ?? "Unknown SMTP error"}. Check SMTP credentials in server/.env`,
      });
    }
  }
);
