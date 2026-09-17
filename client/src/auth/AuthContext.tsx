import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "../api/client";
import type { CompanySummary, CurrentUser } from "../api/types";

interface AuthContextValue {
  user: CurrentUser | null;
  companies: CompanySummary[];
  currentCompany: CompanySummary | null;
  loading: boolean;
  setCurrentCompanyId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, companyName: string) => Promise<void>;
  logout: () => void;
  refreshCompanies: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const CURRENT_COMPANY_KEY = "dmxi_current_company";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [currentCompanyId, setCurrentCompanyIdState] = useState<string | null>(
    () => localStorage.getItem(CURRENT_COMPANY_KEY)
  );
  const [loading, setLoading] = useState(true);

  function setCurrentCompanyId(id: string) {
    setCurrentCompanyIdState(id);
    localStorage.setItem(CURRENT_COMPANY_KEY, id);
  }

  async function loadCompanies() {
    const list = await api.get<CompanySummary[]>("/companies");
    setCompanies(list);
    if (list.length > 0 && !list.some((c) => c.id === currentCompanyId)) {
      setCurrentCompanyId(list[0].id);
    }
    return list;
  }

  async function bootstrap() {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [me, list] = await Promise.all([api.get<CurrentUser>("/auth/me"), loadCompanies()]);
      setUser(me);
      if (list.length > 0 && !currentCompanyId) {
        setCurrentCompanyId(list[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const result = await api.post<{ token: string; user: CurrentUser }>("/auth/login", { email, password });
    setToken(result.token);
    setUser(result.user);
    await loadCompanies();
  }

  async function register(name: string, email: string, password: string, companyName: string) {
    const result = await api.post<{ token: string; user: CurrentUser; company: CompanySummary }>(
      "/auth/register",
      { name, email, password, companyName }
    );
    setToken(result.token);
    setUser(result.user);
    setCompanies([result.company]);
    setCurrentCompanyId(result.company.id);
  }

  function logout() {
    setToken(null);
    setUser(null);
    setCompanies([]);
    setCurrentCompanyIdState(null);
    localStorage.removeItem(CURRENT_COMPANY_KEY);
  }

  const currentCompany = useMemo(
    () => companies.find((c) => c.id === currentCompanyId) ?? null,
    [companies, currentCompanyId]
  );

  const value: AuthContextValue = {
    user,
    companies,
    currentCompany,
    loading,
    setCurrentCompanyId,
    login,
    register,
    logout,
    refreshCompanies: async () => {
      await loadCompanies();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
