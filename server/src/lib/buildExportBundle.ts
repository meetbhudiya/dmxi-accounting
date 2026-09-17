import { prisma } from "./prisma";

export async function buildExportBundle(companyId: string) {
  const [company, customers, vendors, products, invoices, expenses, purchases] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.customer.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.vendor.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    prisma.invoice.findMany({
      where: { companyId },
      include: { items: true, payments: true },
      orderBy: { issueDate: "asc" },
    }),
    prisma.expense.findMany({ where: { companyId }, orderBy: { date: "asc" } }),
    prisma.purchase.findMany({
      where: { companyId },
      include: { items: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const payments = invoices.flatMap((inv) =>
    inv.payments.map((p) => ({ ...p, invoiceId: inv.id }))
  );
  const invoicesClean = invoices.map(({ payments: _p, ...inv }) => inv);

  return {
    version: "1",
    exportedAt: new Date().toISOString(),
    sourceBranchName: company?.name ?? "Unknown Branch",
    sourceCompanyId: companyId,
    data: { customers, vendors, products, invoices: invoicesClean, payments, expenses, purchases },
  };
}
