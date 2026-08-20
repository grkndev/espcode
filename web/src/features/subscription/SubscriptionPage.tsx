"use client";

import Link from "next/link";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuotaBar from "@/features/auth/QuotaBar";
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
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="[font-family:var(--font-display)] text-xl font-semibold tracking-tight">
          espcode
        </Link>
        <Button render={<Link href="/" />} nativeButton={false} variant="ghost" size="sm">
          <ArrowLeft size={14} strokeWidth={2.25} />
          Panoya dön
        </Button>
      </header>

      <main className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-xl border border-border bg-card px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Mevcut plan</p>
              <h1 className="[font-family:var(--font-display)] text-2xl font-semibold tracking-tight">
                Ücretsiz
              </h1>
            </div>
            <QuotaBar used={user.quota.projects.used} max={user.quota.projects.max} />
          </div>

          <ul className="mt-5 flex flex-col gap-2.5 border-t border-border pt-5 text-sm">
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
          <Clock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          <p>
            Ücretli planlar henüz yok. İleride daha yüksek proje/versiyon limitleri sunan bir abonelik
            sistemi eklenebilir.
          </p>
        </div>
      </main>
    </div>
  );
}
