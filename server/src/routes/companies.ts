import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { CompanyScopedRequest, requireCompanyMember } from "../middleware/company";

export const companiesRouter = Router();

companiesRouter.use(requireAuth);

// List companies the current user belongs to
companiesRouter.get("/", async (req: AuthedRequest, res) => {
  const memberships = await prisma.companyMember.findMany({
    where: { userId: req.userId! },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });

  res.json(
    memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      role: m.role,
    }))
  );
});

const createCompanySchema = z.object({ name: z.string().min(1) });

// Create a new company (the creator becomes OWNER)
companiesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        name: parsed.data.name,
        members: { create: { userId: req.userId!, role: "OWNER" } },
      },
    });

    await tx.account.createMany({
      data: [
        { companyId: created.id, code: "1000", name: "Cash", type: "ASSET" },
        { companyId: created.id, code: "1100", name: "Accounts Receivable", type: "ASSET" },
        { companyId: created.id, code: "2000", name: "Accounts Payable", type: "LIABILITY" },
        { companyId: created.id, code: "3000", name: "Owner's Equity", type: "EQUITY" },
        { companyId: created.id, code: "4000", name: "Sales Revenue", type: "REVENUE" },
        { companyId: created.id, code: "5000", name: "General Expenses", type: "EXPENSE" },
      ],
    });

    return created;
  });

  res.status(201).json({ id: company.id, name: company.name, role: "OWNER" });
});

// Rename a company (admin+ only)
companiesRouter.patch(
  "/:companyId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const updated = await prisma.company.update({
      where: { id: req.companyId! },
      data: { name: parsed.data.name.trim() },
    });
    res.json({ id: updated.id, name: updated.name });
  }
);

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER"]),
});

// Add an existing user as a member of this company (admin+ only)
companiesRouter.post(
  "/:companyId/members",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      return res.status(404).json({ error: "No user with that email exists yet" });
    }

    const member = await prisma.companyMember.upsert({
      where: { companyId_userId: { companyId: req.companyId!, userId: user.id } },
      update: { role: parsed.data.role },
      create: { companyId: req.companyId!, userId: user.id, role: parsed.data.role },
    });

    res.status(201).json({ userId: member.userId, role: member.role });
  }
);

// Create a new user account and add them to this company (admin+ only)
companiesRouter.post(
  "/:companyId/members/create-user",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const schema = z.object({
      name:     z.string().min(1),
      email:    z.string().email(),
      password: z.string().min(8, "Password must be at least 8 characters"),
      role:     z.enum(["ADMIN", "ACCOUNTANT", "VIEWER"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { name, email, password, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists. Use 'Add existing user' instead." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    await prisma.companyMember.create({ data: { companyId: req.companyId!, userId: user.id, role } });

    res.status(201).json({ id: user.id, name: user.name, email: user.email, role });
  }
);

// Update a member's role (admin+ only)
companiesRouter.patch(
  "/:companyId/members/:userId/role",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const schema = z.object({ role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const member = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId: req.companyId!, userId: req.params.userId } },
    });
    if (!member) return res.status(404).json({ error: "Member not found" });

    // Cannot change the OWNER's role
    if (member.role === "OWNER") return res.status(403).json({ error: "Cannot change the Owner's role" });

    const updated = await prisma.companyMember.update({
      where: { companyId_userId: { companyId: req.companyId!, userId: req.params.userId } },
      data:  { role: parsed.data.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    res.json({ ...updated.user, role: updated.role });
  }
);

// Remove a member from this company (admin+ only, cannot remove owner)
companiesRouter.delete(
  "/:companyId/members/:userId",
  requireCompanyMember("ADMIN"),
  async (req: CompanyScopedRequest, res) => {
    const member = await prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId: req.companyId!, userId: req.params.userId } },
    });
    if (!member) return res.status(404).json({ error: "Member not found" });
    if (member.role === "OWNER") return res.status(403).json({ error: "Cannot remove the Owner" });
    if (req.params.userId === req.userId) return res.status(403).json({ error: "Cannot remove yourself" });

    await prisma.companyMember.delete({
      where: { companyId_userId: { companyId: req.companyId!, userId: req.params.userId } },
    });
    res.json({ success: true });
  }
);

// List members of this company
companiesRouter.get(
  "/:companyId/members",
  requireCompanyMember("VIEWER"),
  async (req: CompanyScopedRequest, res) => {
    const members = await prisma.companyMember.findMany({
      where: { companyId: req.companyId! },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    res.json(members.map((m) => ({ ...m.user, role: m.role })));
  }
);
