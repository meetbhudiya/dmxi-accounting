import { prisma } from "./prisma";

export interface AuditParams {
  companyId: string;
  userId: string;
  userEmail: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "CANCEL" | "VOID";
  entity: string;
  entityId: string;
  entityRef?: string;
  changes?: Record<string, unknown>;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const { changes, ...rest } = params;
    await prisma.auditLog.create({
      data: {
        ...rest,
        changes: changes !== undefined ? JSON.stringify(changes) : undefined,
      },
    });
  } catch {
    // never let audit failure crash a business operation
  }
}
