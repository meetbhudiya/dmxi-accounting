export type CompanyRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "VIEWER";
export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
export type ExpenseStatus = "UNPAID" | "PAID" | "CANCELLED";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  role: CompanyRole;
}

export interface Account {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: AccountType;
  isActive: boolean;
}

export interface JournalLine {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
  description?: string | null;
  account?: Account;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo?: string | null;
  reference?: string | null;
  lines: JournalLine[];
}

export interface LedgerRow {
  id: string;
  date: string;
  memo?: string | null;
  reference?: string | null;
  description?: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  kraPin?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  brandId?: string | null;
  brand?: Brand | null;
  unitPrice: string;
  unit?: string | null;
  isActive: boolean;
  stockQty: string;
  reorderLevel: string;
}

export interface InvoiceItem {
  id?: string;
  product?: string | null;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
}

export interface Payment {
  id: string;
  amount: string;
  date: string;
  method?: string | null;
  notes?: string | null;
  isVoided?: boolean;
  voidedAt?: string | null;
  voidNote?: string | null;
}

export interface PaymentListItem {
  id: string;
  invoiceId: string;
  amount: string;
  date: string;
  method?: string | null;
  notes?: string | null;
  isVoided: boolean;
  voidedAt?: string | null;
  voidNote?: string | null;
  createdAt: string;
  invoice: { id: string; number: string; reference?: string | null; grandTotal?: string; customer: { name: string } };
}

export interface Invoice {
  id: string;
  number: string;
  reference?: string | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  notes?: string | null;
  discountPercent: string;
  vatPercent: string;
  customer: Customer;
  items: InvoiceItem[];
  payments: Payment[];
  creditNotes?: CreditNote[];
  subtotal: string;
  discountAmount: string;
  vatAmount: string;
  grandTotal: string;
  amountPaid: string;
  creditNoteTotal?: string;
  balanceDue: string;
}

export interface CreditNote {
  id: string;
  number: string;
  amount: string;
  date: string;
  reason?: string | null;
}

export interface Expense {
  id: string;
  category: string;
  description?: string | null;
  reference?: string | null;
  voucherNo?: string | null;
  amount: string;
  date: string;
  status: ExpenseStatus;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  vendor?: Vendor | null;
}

export interface StatementLine {
  id: string;
  date: string;
  voucherNo: string;
  reference?: string | null;
  type: string;
  description: string;
  vendor?: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BrandStatement {
  brand: Brand;
  lines: StatementLine[];
  totalCredit: number;
  totalDebit: number;
  balance: number;
}

export interface CustomerStatement {
  customer: Customer;
  lines: StatementLine[];
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface VendorStatement {
  vendor: Vendor;
  lines: StatementLine[];
  totalCredit: number;
  totalDebit: number;
  balance: number;
}

export interface PurchaseItem {
  id: string;
  productId?: string | null;
  description?: string | null;
  quantity: string;
  unitCost: string;
  product?: Product | null;
}

export interface Purchase {
  id: string;
  date: string;
  status: ExpenseStatus;
  reference?: string | null;
  voucherNo?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  vendor?: Vendor | null;
  items: PurchaseItem[];
}

export interface DashboardSummary {
  openInvoiceCount: number;
  totalReceivable: string;
  unpaidExpenseCount: number;
  totalPayable: string;
  customerCount: number;
  vendorCount: number;
}

export interface ProfitAndLoss {
  from?: string;
  to?: string;
  revenue: { accountId: string; code: string; name: string; amount: string }[];
  expenses: { accountId: string; code: string; name: string; amount: string }[];
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
}

export interface BalanceSheet {
  asOf: string;
  assets: { accountId: string; code: string; name: string; balance: string }[];
  liabilities: { accountId: string; code: string; name: string; balance: string }[];
  equity: { accountId: string; code: string; name: string; balance: string }[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  retainedEarnings: string;
  totalLiabilitiesAndEquity: string;
}

export interface CashFlow {
  from?: string;
  to?: string;
  cashAccounts: { id: string; code: string; name: string }[];
  netChange: string;
  byCategory: Record<string, string>;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
}

export interface TrialBalance {
  asOf: string;
  rows: TrialBalanceRow[];
  grandDebit: string;
  grandCredit: string;
  balanced: boolean;
}
