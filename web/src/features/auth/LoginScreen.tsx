"use client";

import { Button } from "@/components/ui/button";

export interface LoginScreenProps {
  onLogin: () => void;
}

// lucide-react marka ikonlarını (Github dahil) barındırmıyor — GitHub
// logosu burada sabit bir inline SVG olarak tutuluyor.
function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.68.92.68 1.85V21c0 .27.16.59.67.5A10 10 0 0 0 22 12 10 10 0 0 0 12 2z" />
    </svg>
  );
}

// frontend.plan.md §11 — IDE dışı yüzey, datasheet paleti (--stock/--ink/--signal).
// design_handoff_espcode_redesign — ekran 2d/3d: tek datasheet kartı, GitHub
// ile giriş. Gösterilen kotalar (20 proje, 30 sürüm) gerçek iş kuralları
// (bkz. SubscriptionPage.tsx FREE_FEATURES) ile aynı, uydurma değil.
export default function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-foreground">
      <div className="absolute top-6 left-7 flex items-baseline gap-2.5">
        <span className="font-[family-name:var(--font-display)] text-lg font-bold text-foreground">
          espcode
        </span>
        <span className="font-[family-name:var(--font-data)] text-[9px] font-medium tracking-[0.14em] text-muted-foreground">
          WEB IDE · REV 2
        </span>
      </div>

      <div className="w-full max-w-[380px] rounded-2xl border border-border bg-card px-8 pt-8 pb-7">
        <div className="font-[family-name:var(--font-data)] text-[10px] font-medium tracking-[0.16em] text-muted-foreground">
          GİRİŞ
        </div>
        <h1 className="mt-2.5 font-[family-name:var(--font-display)] text-[26px] leading-tight font-semibold tracking-[-0.01em]">
          Tarayıcıdan yaz,
          <br />
          karta yükle.
        </h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
          ESP32 projelerin için derleme, flash, seri monitör ve versiyon geçmişi — kurulum yok.
        </p>

        <Button
          onClick={onLogin}
          className="mt-[22px] h-11 w-full rounded-[11px] bg-foreground text-sm font-semibold text-background hover:bg-foreground/85"
        >
          <GithubMark size={16} />
          GitHub ile devam et
        </Button>

        <div className="mt-[22px] border-t border-dashed border-rule-soft" />

        <div className="mt-3.5 flex flex-col gap-1.5 font-[family-name:var(--font-data)] text-[10.5px] text-faint">
          <span>● 20 PROJE · 30 SÜRÜM/PROJE ÜCRETSİZ</span>
          <span>● SERİ DESTEĞİ: CHROME / EDGE / FF 151+</span>
        </div>
      </div>

      <p className="absolute bottom-5 font-[family-name:var(--font-data)] text-[10px] text-muted-foreground/60">
        GİRİŞ YAPARAK KULLANIM KOŞULLARINI KABUL EDERSİN
      </p>
    </div>
  );
}
