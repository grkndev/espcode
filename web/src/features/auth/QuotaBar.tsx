import { cn } from "@/lib/utils";

export interface QuotaBarProps {
  used: number;
  max: number;
  className?: string;
  barClassName?: string;
}

// ProfilePage.tsx'teki bilgi kartı satırında kullanılır — proje kotasını
// ince bir ilerleme çubuğu + mono "kullanılan/maksimum" değeriyle gösterir,
// limite ulaşıldığında --alarm/destructive'e döner. Dashboard header'ında
// bunun yerine tik ölçekli TickQuota kullanılıyor (bkz. TickQuota.tsx).
export default function QuotaBar({ used, max, className, barClassName }: QuotaBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const full = used >= max;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("h-1 w-[90px] overflow-hidden rounded-full bg-rule-soft", barClassName)}>
        <div
          className={cn("h-full rounded-full transition-all", full ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-[family-name:var(--font-data)] text-xs font-medium">
        {used}/{max}
      </span>
    </div>
  );
}
