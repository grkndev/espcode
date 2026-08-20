import { cn } from "@/lib/utils";

export interface TickQuotaProps {
  used: number;
  max: number;
  /** "inline" (Dashboard başlığı): çentikler + etiket yan yana.
   *  "stacked" (Abonelik kartı): çentikler üstte, etiket altta, sağa hizalı. */
  layout?: "inline" | "stacked";
  className?: string;
}

// Dashboard.tsx başlık bloğu ve SubscriptionPage.tsx kart üst köşesi — proje
// kotasını "1 / 20 PROJE" mono etiketiyle birlikte tik ölçekli bir gösterge
// olarak sunar (her 5. çentik uzun). QuotaBar.tsx'teki ince ilerleme
// çubuğundan ayrı: o Profil sayfasının bilgi kartında kullanılıyor.
export default function TickQuota({ used, max, layout = "inline", className }: TickQuotaProps) {
  const ticks = (
    <div className="flex items-end gap-[3px]" aria-hidden>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[0.5px]",
            i === 0 || (i + 1) % 5 === 0 ? "h-3" : "h-[9px]",
            i < used ? "bg-primary" : "bg-border",
          )}
        />
      ))}
    </div>
  );
  const label = (
    <span className="font-[family-name:var(--font-data)] text-[11px] font-medium text-muted-foreground">
      {used} / {max} PROJE
    </span>
  );

  if (layout === "stacked") {
    return (
      <div className={cn("flex flex-col items-end gap-1.5", className)}>
        {ticks}
        {label}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {ticks}
      {label}
    </div>
  );
}
