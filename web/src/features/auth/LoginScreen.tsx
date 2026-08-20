"use client";

import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LoginScreenProps {
  onLogin: () => void;
}

// frontend.plan.md §11 — IDE dışı yüzey, datasheet paleti (--stock/--ink/--signal).
export default function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="[font-family:var(--font-display)] text-3xl font-semibold tracking-tight">
          espcode
        </span>
        <p className="max-w-xs text-sm text-muted-foreground">
          Tarayıcıda ESP32 IDE. Projelerini kaydetmek ve versiyon geçmişini görmek için
          GitHub ile giriş yap.
        </p>
      </div>

      <Button onClick={onLogin} size="lg">
        <LogIn size={16} strokeWidth={2.25} />
        GitHub ile giriş yap
      </Button>
    </div>
  );
}
