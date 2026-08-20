"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// next-themes zaten bir bağımlılık olarak kuruluydu ama hiç sağlayıcısı
// yoktu (bkz. globals.css §11.1 yorumu) — Dashboard/Profil/Abonelik/giriş
// ekranı ve paylaşılan dialog'lar için Açık/Koyu/Sistem tercihini burada
// gerçek kılıyoruz. Editör kabuğu (--vsc-*) kasıtlı olarak sabit koyu kalır,
// bu sağlayıcıdan etkilenmez (globals.css'te ayrı, .dark'a bağlı olmayan bir
// :root bloğu).
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
