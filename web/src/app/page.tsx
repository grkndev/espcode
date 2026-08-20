"use client";

import { useAuth } from "@/features/auth/useAuth";
import LoginScreen from "@/features/auth/LoginScreen";
import Dashboard from "@/features/dashboard/Dashboard";

// Editör artık ana sayfa değil (bkz. features/ide, app/editor/page.tsx) — burası
// yalnızca giriş kapısı: girişsizken sadece login ekranı, girişliyken dashboard.
export default function Home() {
  const auth = useAuth();

  if (auth.loading) return null;
  if (!auth.user) return <LoginScreen onLogin={auth.login} />;
  return <Dashboard user={auth.user} onLogout={auth.logout} />;
}
