"use client";

import { useState } from "react";
import { Plus, X, FileCode } from "lucide-react";
import { type SketchFile, PRIMARY_FILE, isValidFileName } from "./sketch-files";

export interface FileTreeProps {
  files: SketchFile[];
  activePath: string;
  onOpen: (path: string) => void;
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
}

// VSCode'daki dosya türüne göre renkli ikon geleneği
const ICON_COLOR: Record<string, string> = {
  ino: "#00979d",
  cpp: "#519aba",
  h: "#a074c4",
  hpp: "#a074c4",
};

function iconColor(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return ICON_COLOR[ext] ?? "#858585";
}

export default function FileTree({ files, activePath, onOpen, onAdd, onRemove }: FileTreeProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  function commitAdd() {
    if (!draft) {
      setAdding(false);
      return;
    }
    if (!isValidFileName(draft) || files.some((f) => f.path === draft)) {
      setInvalid(true);
      return;
    }
    onAdd(draft);
    setDraft("");
    setAdding(false);
    setInvalid(false);
  }

  return (
    <div className="flex h-full flex-col bg-[var(--vsc-sidebar)] p-3 text-[var(--vsc-fg)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)]">
          Sketch
        </span>
        <button
          onClick={() => setAdding(true)}
          title="Yeni dosya"
          className="rounded py-1 text-[var(--vsc-fg-muted)] hover:bg-[var(--vsc-selected)] hover:text-[var(--vsc-fg-active)]"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>

      <ul className="flex flex-col gap-0.5">
        {files.map((f) => (
          <li key={f.path} className="group">
            <button
              onClick={() => onOpen(f.path)}
              className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-[13px] font-medium ${
                f.path === activePath
                  ? "bg-[var(--vsc-selected)] text-[var(--vsc-fg-active)]"
                  : "text-[var(--vsc-fg)] hover:bg-[var(--vsc-selected)]/60"
              }`}
            >
              <FileCode size={16} strokeWidth={2.25} color={iconColor(f.path)} className="shrink-0" />
              <span className="flex-1 truncate">{f.path}</span>
              {f.path !== PRIMARY_FILE && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(f.path);
                  }}
                  className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10"
                >
                  <X size={12} strokeWidth={2.5} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-2 px-4">
          <input
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onBlur={commitAdd}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
                setInvalid(false);
              }
            }}
            placeholder="dosya.h"
            className={`w-full rounded border bg-[var(--vsc-selected)] px-2.5 py-2 font-[var(--font-data)] text-xs text-[var(--vsc-fg-active)] ${
              invalid ? "border-red-500" : "border-[var(--vsc-accent)]"
            }`}
          />
          {invalid && <p className="mt-1 text-[10px] text-red-400">.ino / .cpp / .h / .hpp, benzersiz ad</p>}
        </div>
      )}
    </div>
  );
}
