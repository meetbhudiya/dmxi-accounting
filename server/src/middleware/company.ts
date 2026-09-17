import { Response, NextFunction } from "express";
import { CompanyRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./auth";

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

/**
 * Resolves :companyId from the route, ensures the authenticated user is a
 * member of that company, and attaches companyId/companyRole to the request.
 */
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

      if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
        return res.status(403).json({ error: "Insufficient permissions for this action" });
      }

      req.companyId = companyId;
      req.companyRole = membership.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
