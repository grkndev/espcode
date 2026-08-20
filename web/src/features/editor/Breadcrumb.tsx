"use client";

import { ChevronRight } from "lucide-react";

export default function Breadcrumb({ path }: { path: string }) {
  const segments = ["sketch", path];
  return (
    <div className="flex h-[30px] shrink-0 items-center gap-1.5 bg-[var(--vsc-editor-bg)] px-4 font-[family-name:var(--font-data)] text-[11px] font-medium text-[var(--vsc-fg-faint)]">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={11} strokeWidth={2.5} className="text-[var(--vsc-fg-faint)]" />}
          <span className={i === segments.length - 1 ? "text-[var(--vsc-fg-muted)]" : "hover:text-[var(--vsc-fg-active)]"}>
            {seg}
          </span>
        </span>
      ))}
    </div>
  );
}
