import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { applyTheme, getStoredThemeKey } from "./lib/theme";
import { AuthProvider } from "./auth/AuthContext";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CustomersPage from "./pages/CustomersPage";
import VendorsPage from "./pages/VendorsPage";
import InvoicesPage from "./pages/InvoicesPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import SalesWorkstation from "./pages/SalesWorkstation";
import ExpensesPage from "./pages/ExpensesPage";
import LedgerPage from "./pages/LedgerPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import ProductsPage from "./pages/ProductsPage";
import PurchasesPage from "./pages/PurchasesPage";
import StatementPage from "./pages/StatementPage";
import PaymentsPage from "./pages/PaymentsPage";
import QuotationsPage from "./pages/QuotationsPage";
import ReconciliationPage from "./pages/ReconciliationPage";
import StockReportPage from "./pages/StockReportPage";
import PosPage from "./pages/PosPage";
import AuditPage from "./pages/AuditPage";
import StockCountPage from "./pages/StockCountPage";
import BranchesPage from "./pages/BranchesPage";

export default function App() {
  useEffect(() => { applyTheme(getStoredThemeKey()); }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/new" element={<SalesWorkstation />} />
            <Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="statements" element={<StatementPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="stock" element={<StockReportPage />} />
            <Route path="stock-count" element={<StockCountPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="quotations" element={<QuotationsPage />} />
            <Route path="reconciliation" element={<ReconciliationPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="branches" element={<BranchesPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
