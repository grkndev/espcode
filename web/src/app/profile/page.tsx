"use client";

import { useAuth } from "@/features/auth/useAuth";
import LoginScreen from "@/features/auth/LoginScreen";
import ProfilePage from "@/features/profile/ProfilePage";

export default function Profile() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <span className="animate-pulse [font-family:var(--font-display)] text-2xl font-semibold tracking-tight text-muted-foreground">
          espcode
        </span>
      </div>
    );
  }
  if (!auth.user) return <LoginScreen onLogin={auth.login} />;
  return <ProfilePage user={auth.user} onLogout={auth.logout} />;
}
