"use client";

import { useAuth } from "@/features/auth/useAuth";
import LoginScreen from "@/features/auth/LoginScreen";
import SubscriptionPage from "@/features/subscription/SubscriptionPage";

export default function Subscription() {
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
  return <SubscriptionPage user={auth.user} />;
}
