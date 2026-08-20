"use client";

import { X, FileCode } from "lucide-react";
import { PRIMARY_FILE } from "./sketch-files";

export interface TabBarProps {
  openPaths: string[];
  activePath: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

const ICON_COLOR: Record<string, string> = {
  ino: "#00979d",
  cpp: "#519aba",
  h: "#a074c4",
  hpp: "#a074c4",
};

export default function TabBar({ openPaths, activePath, onSelect, onClose }: TabBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-[var(--vsc-border)] bg-[var(--vsc-activitybar)]">
      {openPaths.map((path) => {
        const active = path === activePath;
        const ext = path.split(".").pop() ?? "";
        return (
          <button
            key={path}
            onClick={() => onSelect(path)}
            className={`group flex shrink-0 items-center gap-2.5 border-r border-[var(--vsc-border)] px-4 font-[family-name:var(--font-ui)] text-[12.5px] font-medium ${
              active
                ? "border-t-2 border-t-[var(--vsc-accent)] bg-[var(--vsc-editor-bg)] text-[var(--vsc-editor-fg)]"
                : "border-t-2 border-t-transparent text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
            }`}
          >
            <FileCode size={15} strokeWidth={2.25} color={ICON_COLOR[ext] ?? "#a1a1aa"} />
            {path}
            {path !== PRIMARY_FILE ? (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(path);
                }}
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-black/10"
              >
                <X size={13} strokeWidth={2.25} />
              </span>
            ) : (
              <span className="w-[13px]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
