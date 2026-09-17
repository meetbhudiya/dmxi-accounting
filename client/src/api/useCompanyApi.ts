import { useMemo } from "react";
import { api } from "./client";
import { useAuth } from "../auth/AuthContext";

/**
 * Returns an API client whose paths are automatically scoped to the
 * currently selected company: companyApi.get("/invoices") -> GET /companies/:id/invoices
 */
export function useCompanyApi() {
  const { currentCompany } = useAuth();

  return useMemo(() => {
    const base = currentCompany ? `/companies/${currentCompany.id}` : null;
    return {
      companyId: currentCompany?.id ?? null,
      get: <T,>(path: string) => api.get<T>(`${base}${path}`),
      post: <T,>(path: string, body?: unknown) => api.post<T>(`${base}${path}`, body),
      patch: <T,>(path: string, body?: unknown) => api.patch<T>(`${base}${path}`, body),
      del: <T = void>(path: string) => api.del<T>(`${base}${path}`),
      getBlob: (path: string) => api.getBlob(`${base}${path}`),
    };
  }, [currentCompany]);
}
