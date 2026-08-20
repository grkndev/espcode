import { cn } from "@/lib/utils";

export interface QuotaBarProps {
  used: number;
  max: number;
  className?: string;
  barClassName?: string;
}

// Dashboard.tsx + ProfilePage.tsx arasında paylaşılan tek kaynak — proje
// kotasını düz "kullanılan/maksimum" metni yerine ince bir ilerleme çubuğuyla
// gösterir, limite ulaşıldığında --alarm/destructive'e döner.
export default function QuotaBar({ used, max, className, barClassName }: QuotaBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const full = used >= max;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("h-1 w-24 overflow-hidden rounded-full bg-muted", barClassName)}>
        <div
          className={cn("h-full rounded-full transition-all", full ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {used}/{max} proje
      </span>
    </div>
  );
}
