"use client";

import Link from "next/link";
import { ArrowLeft, FolderOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolCard {
  href: string;
  icon: typeof Zap;
  title: string;
  description: string;
  disabled?: boolean;
}

// İlk araç "Bin Yaz" — ileride kartın içindeki dosyaları çekme gibi başka
// araçlar da buraya eklenecek (bkz. master.plan.md ilgili not). Liste büyüdükçe
// yalnızca bu diziye eklenir, sayfa yapısı değişmez.
const TOOLS: ToolCard[] = [
  {
    href: "/tools/flash",
    icon: Zap,
    title: "Bin Yaz",
    description: "Hazır bir .bin dosyasını derlemeden doğrudan karta yaz.",
  },
  {
    href: "/tools/files",
    icon: FolderOpen,
    title: "Dosya Yöneticisi",
    description: "Kartın flash belleğindeki dosyaları görüntüle ve indir.",
    disabled: true,
  },
];

export default function ToolsIndex() {
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

      <main className="mx-auto max-w-6xl px-7 pt-9 pb-10 lg:px-14">
        <p className="font-[family-name:var(--font-data)] text-[10px] font-medium tracking-[0.16em] text-muted-foreground">
          ARAÇLAR
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-[32px] leading-none font-semibold tracking-[-0.01em]">
          Araçlar
        </h1>
        <p className="mt-3.5 max-w-lg text-[13px] text-muted-foreground">
          Editörden bağımsız, karta doğrudan erişen yardımcı araçlar. Giriş yapmadan da
          kullanılabilir.
        </p>

        <ul className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const body = (
              <>
                <div className="flex size-9 items-center justify-center rounded-[10px] bg-muted text-foreground">
                  <Icon size={16} strokeWidth={2.25} />
                </div>
                <div className="mt-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-[family-name:var(--font-ui)] text-[15px] font-semibold">
                      {tool.title}
                    </span>
                    {tool.disabled && (
                      <span className="rounded-full border border-rule-soft px-1.5 py-0.5 font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.08em] text-muted-foreground">
                        YAKINDA
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">{tool.description}</p>
                </div>
              </>
            );

            if (tool.disabled) {
              return (
                <li
                  key={tool.href}
                  className="flex h-full flex-col rounded-xl border border-dashed border-rule-soft bg-card/50 px-5 py-[18px] opacity-60"
                >
                  {body}
                </li>
              );
            }

            return (
              <li key={tool.href}>
                <Link
                  href={tool.href}
                  className="flex h-full flex-col rounded-xl border border-border bg-card px-5 py-[18px] transition-colors hover:border-primary/40"
                >
                  {body}
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
