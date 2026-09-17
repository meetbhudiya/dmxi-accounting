import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

// All standard system accounts used for auto-posting
const SYSTEM_ACCOUNTS: Record<string, { name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" }> = {
  "1000": { name: "Cash",                    type: "ASSET" },
  "1100": { name: "Accounts Receivable",     type: "ASSET" },
  "1200": { name: "Inventory",               type: "ASSET" },
  "2000": { name: "Accounts Payable",        type: "LIABILITY" },
  "2100": { name: "VAT Payable",             type: "LIABILITY" },
  "3000": { name: "Owner's Equity",          type: "EQUITY" },
  "4000": { name: "Sales Revenue",           type: "REVENUE" },
  "5000": { name: "General Expenses",        type: "EXPENSE" },
  "5100": { name: "Salary Expense",          type: "EXPENSE" },
  "5200": { name: "Rent Expense",            type: "EXPENSE" },
  "5300": { name: "Utilities Expense",       type: "EXPENSE" },
  "5400": { name: "Insurance Expense",       type: "EXPENSE" },
  "5500": { name: "Transport Expense",       type: "EXPENSE" },
  "5600": { name: "Marketing Expense",       type: "EXPENSE" },
  "5700": { name: "Office Supplies Expense", type: "EXPENSE" },
  "5800": { name: "Cost of Goods Sold",      type: "EXPENSE" },
};

// Maps expense category name → account code
export const EXPENSE_CATEGORY_ACCOUNT: Record<string, string> = {
  "Salary":          "5100",
  "Rent":            "5200",
  "Utilities":       "5300",
  "Insurance":       "5400",
  "Transport":       "5500",
  "Marketing":       "5600",
  "Office Supplies": "5700",
  "Other":           "5000",
};

export const ALL_SYSTEM_ACCOUNTS = SYSTEM_ACCOUNTS;

// Gets or creates a system account for a company by code
export async function getOrCreateAccount(tx: TxClient, companyId: string, code: string): Promise<string> {
  const def = SYSTEM_ACCOUNTS[code];
  if (!def) throw new Error(`Unknown system account code: ${code}`);
  const acct = await tx.account.upsert({
    where: { companyId_code: { companyId, code } },
    update: {},
    create: { companyId, code, name: def.name, type: def.type },
    select: { id: true },
  });
  return acct.id;
}

export interface PostLine {
  accountCode: string;
  debit?: number | Prisma.Decimal;
  credit?: number | Prisma.Decimal;
  description?: string;
}

// Posts a balanced journal entry; throws if lines are unbalanced
export async function postJournal(
  tx: TxClient,
  companyId: string,
  opts: { date: Date; memo: string; reference?: string; lines: PostLine[] }
) {
  const resolved = await Promise.all(
    opts.lines.map(async (l) => ({
      accountId: await getOrCreateAccount(tx, companyId, l.accountCode),
      debit:       new Prisma.Decimal(l.debit  ?? 0),
      credit:      new Prisma.Decimal(l.credit ?? 0),
      description: l.description,
    }))
  );

  const totalDebit  = resolved.reduce((s, l) => s.plus(l.debit),  new Prisma.Decimal(0));
  const totalCredit = resolved.reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));
  if (!totalDebit.equals(totalCredit)) {
    throw new Error(`Unbalanced journal entry: DR ${totalDebit} ≠ CR ${totalCredit}`);
  }

  return tx.journalEntry.create({
    data: {
      companyId,
      date:      opts.date,
      memo:      opts.memo,
      reference: opts.reference,
      lines:     { create: resolved },
    },
  });
}
