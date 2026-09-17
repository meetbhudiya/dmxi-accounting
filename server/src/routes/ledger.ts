import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";

export const ledgerRouter = Router({ mergeParams: true });

ledgerRouter.use(requireCompanyMember("VIEWER"));

// ---------- Chart of Accounts ----------

const accountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
});

ledgerRouter.get("/accounts", async (req: CompanyScopedRequest, res) => {
  const accounts = await prisma.account.findMany({
    where: { companyId: req.companyId! },
    orderBy: { code: "asc" },
  });
  res.json(accounts);
});

ledgerRouter.post("/accounts", requireCompanyMember("OWNER"), async (req: CompanyScopedRequest, res) => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const account = await prisma.account.create({
      data: { companyId: req.companyId!, ...parsed.data },
    });
    res.status(201).json(account);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "An account with this code already exists" });
    }
    throw err;
  }
});

// ---------- Journal Entries (double-entry bookkeeping) ----------

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().optional(),
});

const journalEntrySchema = z.object({
  date: z.coerce.date(),
  memo: z.string().optional(),
  reference: z.string().optional(),
  lines: z.array(journalLineSchema).min(2),
});

ledgerRouter.get("/journal-entries", async (req: CompanyScopedRequest, res) => {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: req.companyId! },
    include: { lines: { include: { account: true } } },
    orderBy: { date: "desc" },
  });
  res.json(entries);
});

ledgerRouter.post(
  "/journal-entries",
  requireCompanyMember("ACCOUNTANT"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = journalEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { date, memo, reference, lines } = parsed.data;

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      return res.status(400).json({
        error: "Journal entry is not balanced: total debits must equal total credits",
        totalDebit,
        totalCredit,
      });
    }
    if (totalDebit === 0) {
      return res.status(400).json({ error: "Journal entry must have a non-zero amount" });
    }

    // Verify all referenced accounts belong to this company
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds }, companyId: req.companyId! },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) {
      return res.status(400).json({ error: "One or more accounts are invalid for this company" });
    }

    const entry = await prisma.journalEntry.create({
      data: {
        companyId: req.companyId!,
        date,
        memo,
        reference,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });

    res.status(201).json(entry);
  }
);

// General ledger view: running balance per account
ledgerRouter.get("/accounts/:accountId/ledger", async (req: CompanyScopedRequest, res) => {
  const account = await prisma.account.findFirst({
    where: { id: req.params.accountId, companyId: req.companyId! },
  });
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }

  const lines = await prisma.journalLine.findMany({
    where: { accountId: account.id },
    include: { journalEntry: true },
    orderBy: { journalEntry: { date: "asc" } },
  });

  const isDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";
  let balance = new Prisma.Decimal(0);
  const rows = lines.map((l) => {
    const delta = isDebitNormal
      ? l.debit.minus(l.credit)
      : l.credit.minus(l.debit);
    balance = balance.plus(delta);
    return {
      id: l.id,
      date: l.journalEntry.date,
      memo: l.journalEntry.memo,
      reference: l.journalEntry.reference,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
      balance,
    };
  });

  res.json({ account, lines: rows, endingBalance: balance });
});
