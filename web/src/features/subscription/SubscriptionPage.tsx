"use client";

import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import TickQuota from "@/features/auth/TickQuota";
import type { AuthUser } from "@/features/auth/useAuth";

export interface SubscriptionPageProps {
  user: AuthUser;
}

// master.plan.md — dürüst yer tutucu: yalnızca bugün gerçekten var olan
// limitler listelenir (projects.service.ts MAX_PROJECTS_PER_USER,
// postgres-storage.service.ts MAX_VERSIONS_PER_PROJECT). Uydurma fiyat
// tablosu / sahte plan yok — ücretli katman eklendiğinde bu sayfa gerçek
// içerikle doldurulur.
const FREE_FEATURES = [
  "20 proje",
  "Proje başına 30 versiyon geçmişi (Postgres depolamada)",
  "Kendi GitHub deponla bağlandığında versiyon geçmişi GitHub'da sınırsız",
  "Derleme, flash, seri monitör ve plotter",
];

export default function SubscriptionPage({ user }: SubscriptionPageProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-13 items-center justify-between border-b border-border px-6">
        <Link href="/" className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-tight">
          espcode
        </Link>
        <Button render={<Link href="/" />} nativeButton={false} variant="ghost" size="sm">
          <ArrowLeft size={14} strokeWidth={2.25} />
          Panoya dön
        </Button>
      </header>

      <main className="flex flex-col items-center px-6 pt-10 pb-16">
        <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card px-7 py-6.5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-[family-name:var(--font-data)] text-[10px] font-medium tracking-[0.14em] text-muted-foreground">
                MEVCUT PLAN
              </p>
              <h1 className="mt-1.5 font-[family-name:var(--font-display)] text-[28px] leading-none font-semibold tracking-[-0.01em]">
                Ücretsiz
              </h1>
            </div>
            <TickQuota used={user.quota.projects.used} max={user.quota.projects.max} layout="stacked" />
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <ul className="flex flex-col gap-3 text-[13.5px] leading-normal">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <span className="font-semibold text-primary">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-3.5 flex w-full max-w-[440px] items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-rule-soft px-5.5 py-4">
          <Clock size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Ücretli planlar henüz yok. İleride daha yüksek proje/versiyon limitleri sunan bir abonelik
            sistemi eklenebilir.
          </p>
        </div>
      </main>
    </div>
  );
}
