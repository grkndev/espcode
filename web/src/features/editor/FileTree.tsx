"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { X, FileCode } from "lucide-react";
import { type SketchFile, PRIMARY_FILE, isValidFileName } from "./sketch-files";

export interface FileTreeProps {
  files: SketchFile[];
  activePath: string;
  onOpen: (path: string) => void;
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
}

export interface FileTreeHandle {
  /** WorkspacePanel'in "SKETCH" bölüm başlığındaki "+" butonu bunu çağırır. */
  startAdding: () => void;
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

// design_handoff — "SKETCH" bölümünün gövdesi. Bölüm başlığı (grip tutamacı,
// "+" ekle butonu, katla/aç) artık WorkspacePanel.tsx'te yaşıyor; bu bileşen
// yalnızca dosya listesi + satır içi ekleme input'unu render eder.
const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  { files, activePath, onOpen, onAdd, onRemove },
  ref,
) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  useImperativeHandle(ref, () => ({ startAdding: () => setAdding(true) }), []);

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
    <div className="text-[var(--vsc-fg)]">
      <ul className="flex flex-col gap-0.5 px-2">
        {files.map((f) => (
          <li key={f.path} className="group">
            <button
              onClick={() => onOpen(f.path)}
              className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-[7px] text-left text-[13px] ${
                f.path === activePath
                  ? "bg-[var(--vsc-selected-file)] text-[var(--vsc-fg-active)]"
                  : "text-[var(--vsc-fg)] hover:bg-[var(--vsc-selected)]/60"
              }`}
            >
              <FileCode size={15} strokeWidth={2.25} color={iconColor(f.path)} className="shrink-0" />
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
        <div className="px-2 pt-1">
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
            className={`w-full rounded-[8px] border bg-[var(--vsc-selected)] px-2.5 py-[7px] font-[family-name:var(--font-data)] text-xs text-[var(--vsc-fg-active)] ${
              invalid ? "border-red-500" : "border-[var(--vsc-accent)]"
            }`}
          />
          {invalid && <p className="mt-1 text-[10px] text-red-400">.ino / .cpp / .h / .hpp, benzersiz ad</p>}
        </div>
      )}
    </div>
  );
});

export default FileTree;
