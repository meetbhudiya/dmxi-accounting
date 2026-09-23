import { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./auth";

type CompanyRole = "VIEWER" | "ACCOUNTANT" | "ADMIN" | "OWNER";

export interface CompanyScopedRequest extends AuthedRequest {
  companyId?: string;
  companyRole?: CompanyRole;
}

const ROLE_RANK: Record<CompanyRole, number> = {
  VIEWER: 0,
  ACCOUNTANT: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function requireCompanyMember(minRole: CompanyRole = "VIEWER") {
  return async (req: CompanyScopedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.params.companyId;
      if (!companyId) {
        return res.status(400).json({ error: "companyId is required" });
      }

      const membership = await prisma.companyMember.findUnique({
        where: { companyId_userId: { companyId, userId: req.userId! } },
      });

      if (!membership) {
        return res.status(403).json({ error: "You do not have access to this company" });
      }

      const memberRole = membership.role as CompanyRole;
      if (ROLE_RANK[memberRole] < ROLE_RANK[minRole]) {
        return res.status(403).json({ error: "Insufficient permissions for this action" });
      }

      req.companyId = companyId;
      req.companyRole = memberRole;
      next();
    } catch (err) {
      next(err);
    }
  };
}
