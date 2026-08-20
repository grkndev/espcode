import { useCallback, useEffect, useState } from "react";
import { API_BASE, apiFetch } from "@/lib/api-config";

export interface AuthUser {
  id: string;
  login: string;
  avatarUrl: string | null;
  createdAt: string;
  quota: { projects: { used: number; max: number } };
}

// master.plan.md §4.2 — giriş yalnızca kaydetme için gerekli, editör/derle/
// flash/monitör girişsiz de tam çalışır. Bu hook yalnızca "kim giriş yapmış"
// durumunu taşır, hiçbir akışı bloklamaz.
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/me");
      setUser(res.ok ? await res.json() : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount'ta oturum çerezini sunucuya sor — sorgu kütüphanesi yok, bu
    // projede tek veri kaynağı fetch-on-mount deseni (bkz. useProjects.ts).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  function login() {
    window.location.href = `${API_BASE}/api/auth/github`;
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return { user, loading, login, logout, refresh };
}
