"use client";

import { Bell, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBuildStore, type NotificationEntry } from "./useBuildStore";
import { cn, formatRelativeDate } from "@/lib/utils";

const STATUS_ICON: Record<NotificationEntry["status"], typeof CheckCircle2> = {
  success: CheckCircle2,
  failure: XCircle,
  warning: AlertTriangle,
};

const STATUS_COLOR: Record<NotificationEntry["status"], string> = {
  success: "text-emerald-500",
  failure: "text-destructive",
  warning: "text-amber-500",
};

// useBuildStore artık IdeShell'e değil global olduğu için derleme/flash
// hangi sayfada bitmiş olursa olsun burada görünür (kalıcı, localStorage).
export default function NotificationBell() {
  const notifications = useBuildStore((s) => s.notifications);
  const markAllRead = useBuildStore((s) => s.markAllRead);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Popover onOpenChange={(open) => open && markAllRead()}>
      <PopoverTrigger
        title="Bildirimler"
        className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell size={16} strokeWidth={2.25} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex size-2 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-2 p-2">
        {notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Henüz bildirim yok.</p>
        ) : (
          <ul className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
            {notifications.map((n) => {
              const Icon = STATUS_ICON[n.status];
              return (
                <li key={n.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm">
                  <Icon size={16} strokeWidth={2.25} className={cn("mt-0.5 shrink-0", STATUS_COLOR[n.status])} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{n.message}</p>
                    {n.description && (
                      <p className="truncate text-xs text-muted-foreground">{n.description}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatRelativeDate(new Date(n.timestamp).toISOString())}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
