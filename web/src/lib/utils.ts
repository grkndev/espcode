import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("tr", { numeric: "auto" })

// Dashboard proje kartları + Profil sayfası — ham ISO tarih yerine "3 saat
// önce" gibi göreli bir etiket. Intl.RelativeTimeFormat tr locale'i "az önce"
// için doğal bir birim sunmuyor (0 dakika "bu dakika" der), o yüzden <60sn
// elle karşılanıyor.
export function formatRelativeDate(iso: string): string {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  if (Math.abs(diffSec) < 60) return "az önce"

  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) return RELATIVE_TIME.format(diffMin, "minute")

  const diffHour = Math.round(diffSec / 3600)
  if (Math.abs(diffHour) < 24) return RELATIVE_TIME.format(diffHour, "hour")

  const diffDay = Math.round(diffSec / 86400)
  if (Math.abs(diffDay) < 30) return RELATIVE_TIME.format(diffDay, "day")

  const diffMonth = Math.round(diffSec / (86400 * 30))
  if (Math.abs(diffMonth) < 12) return RELATIVE_TIME.format(diffMonth, "month")

  return RELATIVE_TIME.format(Math.round(diffSec / (86400 * 365)), "year")
}
