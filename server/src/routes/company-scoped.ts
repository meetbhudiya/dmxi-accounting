import { Router } from "express";
import { ledgerRouter } from "./ledger";
import { invoicesRouter } from "./invoices";
import { expensesRouter } from "./expenses";
import { reportsRouter } from "./reports";
import { brandsRouter } from "./brands";
import { productsRouter } from "./products";
import { purchasesRouter } from "./purchases";
import { syncRouter } from "./sync";
import { auditRouter } from "./audit";
import { attachmentsRouter } from "./attachments";
import { quotationsRouter } from "./quotations";

// Mounted at /api/companies/:companyId — combines all per-company resource routers
export const companyScopedRouter = Router({ mergeParams: true });

companyScopedRouter.use(ledgerRouter);
companyScopedRouter.use(invoicesRouter);
companyScopedRouter.use(expensesRouter);
companyScopedRouter.use(brandsRouter);
companyScopedRouter.use(productsRouter);
companyScopedRouter.use(purchasesRouter);
companyScopedRouter.use(quotationsRouter);
companyScopedRouter.use("/reports", reportsRouter);
companyScopedRouter.use("/sync", syncRouter);
companyScopedRouter.use(auditRouter);
companyScopedRouter.use(attachmentsRouter);
