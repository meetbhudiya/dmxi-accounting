import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAuthToken } from "../lib/jwt";
import { AuthedRequest, requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, name: true, email: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

authRouter.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const updates: { name?: string; passwordHash?: string } = {};
  if (name) updates.name = name;

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: "Current password is required to set a new password" });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "Current password is incorrect" });
    updates.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  const updated = await prisma.user.update({
    where: { id: req.userId! },
    data: updates,
    select: { id: true, name: true, email: true },
  });
  res.json(updated);
});

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(1),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password, companyName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash },
    });

    const company = await tx.company.create({
      data: {
        name: companyName,
        members: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });

    // Seed standard chart of accounts for the new company
    await tx.account.createMany({
      data: [
        { companyId: company.id, code: "1000", name: "Cash",                    type: "ASSET" },
        { companyId: company.id, code: "1100", name: "Accounts Receivable",     type: "ASSET" },
        { companyId: company.id, code: "1200", name: "Inventory",               type: "ASSET" },
        { companyId: company.id, code: "2000", name: "Accounts Payable",        type: "LIABILITY" },
        { companyId: company.id, code: "2100", name: "VAT Payable",             type: "LIABILITY" },
        { companyId: company.id, code: "3000", name: "Owner's Equity",          type: "EQUITY" },
        { companyId: company.id, code: "4000", name: "Sales Revenue",           type: "REVENUE" },
        { companyId: company.id, code: "5000", name: "General Expenses",        type: "EXPENSE" },
        { companyId: company.id, code: "5100", name: "Salary Expense",          type: "EXPENSE" },
        { companyId: company.id, code: "5200", name: "Rent Expense",            type: "EXPENSE" },
        { companyId: company.id, code: "5300", name: "Utilities Expense",       type: "EXPENSE" },
        { companyId: company.id, code: "5400", name: "Insurance Expense",       type: "EXPENSE" },
        { companyId: company.id, code: "5500", name: "Transport Expense",       type: "EXPENSE" },
        { companyId: company.id, code: "5600", name: "Marketing Expense",       type: "EXPENSE" },
        { companyId: company.id, code: "5700", name: "Office Supplies Expense", type: "EXPENSE" },
        { companyId: company.id, code: "5800", name: "Cost of Goods Sold",      type: "EXPENSE" },
      ],
    });

    return { user, company };
  });

  const token = signAuthToken({ userId: result.user.id, email: result.user.email });
  res.status(201).json({
    token,
    user: { id: result.user.id, name: result.user.name, email: result.user.email },
    company: { id: result.company.id, name: result.company.name, role: "OWNER" },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signAuthToken({ userId: user.id, email: user.email });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});
