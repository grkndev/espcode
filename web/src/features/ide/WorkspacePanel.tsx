"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, GripVertical, Plus, SlidersHorizontal } from "lucide-react";
import FileTree, { type FileTreeHandle } from "@/features/editor/FileTree";
import { useProjects, type ProjectVersionSummary, type StorageProvider } from "@/features/projects/useProjects";
import type { SketchFile } from "@/features/editor/sketch-files";
import { formatRelativeDate } from "@/lib/utils";

export interface WorkspacePanelProps {
  files: SketchFile[];
  activePath: string;
  onOpenFile: (path: string) => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  activeProjectId: string | null;
  storageProvider: StorageProvider | null;
  onRestoreVersion: (versionId: string) => void;
}

type SectionId = "sketch" | "versions";

interface SectionState {
  id: SectionId;
  collapsed: boolean;
}

const DEFAULT_SECTIONS: SectionState[] = [
  { id: "sketch", collapsed: false },
  { id: "versions", collapsed: false },
];

// design_handoff §"Sol panel bölümleri" — sıra + katlanma durumu proje
// başına saklanır (localStorage; DB'ye taşınmadı, kapsam dışı). Proje
// değişince veya kaydedilmemiş sketch'te "unsaved" anahtarı kullanılır.
function useWorkspaceSections(storageKey: string) {
  const [sections, setSections] = useState<SectionState[]>(DEFAULT_SECTIONS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`espcode:workspace:${storageKey}`);
      const parsed = raw ? (JSON.parse(raw) as SectionState[]) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- proje değişince localStorage'dan tek seferlik okuma, sorgu kütüphanesi yok
      setSections(parsed && parsed.length === DEFAULT_SECTIONS.length ? parsed : DEFAULT_SECTIONS);
    } catch {
      setSections(DEFAULT_SECTIONS);
    }
  }, [storageKey]);

  function persist(next: SectionState[]) {
    setSections(next);
    try {
      localStorage.setItem(`espcode:workspace:${storageKey}`, JSON.stringify(next));
    } catch {
      // localStorage kullanılamıyorsa (gizli sekme kotası vb.) sessizce yut —
      // yalnızca sıralama tercihi kaybolur, işlevsellik etkilenmez.
    }
  }

  function toggleCollapsed(id: SectionId) {
    persist(sections.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s)));
  }

  function reorder(dragId: SectionId, dropId: SectionId) {
    if (dragId === dropId) return;
    const next = [...sections];
    const from = next.findIndex((s) => s.id === dragId);
    const to = next.findIndex((s) => s.id === dropId);
    if (from === -1 || to === -1) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
  }

  return { sections, toggleCollapsed, reorder };
}

function SectionShell({
  id,
  title,
  collapsed,
  onToggleCollapsed,
  draggingId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  trailing,
  children,
}: {
  id: SectionId;
  title: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  draggingId: SectionId | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={draggingId && draggingId !== id ? "opacity-60" : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="flex cursor-grab items-center gap-1.5 px-2.5 py-1.5 active:cursor-grabbing"
      >
        <GripVertical size={13} strokeWidth={2} className="shrink-0 text-[var(--vsc-fg-faint)]" />
        <button
          onClick={onToggleCollapsed}
          className="flex flex-1 items-center gap-1.5 py-0.5 text-left"
        >
          <span className="flex-1 font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.12em] text-[var(--vsc-fg-muted)]">
            {title}
          </span>
          {!trailing && (
            <ChevronDown
              size={12}
              strokeWidth={2.25}
              className={`text-[var(--vsc-fg-muted)] transition-transform ${collapsed ? "-rotate-90" : ""}`}
            />
          )}
        </button>
        {trailing}
      </div>
      {!collapsed && children}
    </div>
  );
}

function VersionHistorySection({
  activeProjectId,
  storageProvider,
  onRestoreVersion,
}: {
  activeProjectId: string;
  storageProvider: StorageProvider | null;
  onRestoreVersion: (versionId: string) => void;
}) {
  const { listVersions } = useProjects();
  const [versions, setVersions] = useState<ProjectVersionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- aktif proje değişince liste sıfırlanır, sorgu kütüphanesi yok (bkz. ProjectsPanel.tsx aynı desen)
    setVersions(null);
    void listVersions(activeProjectId).then((v) => {
      if (!cancelled) setVersions(v);
    });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, listVersions]);

  if (versions === null) {
    return <p className="px-4 pt-1 pb-2.5 text-[11px] text-[var(--vsc-fg-faint)]">Yükleniyor…</p>;
  }
  if (versions.length === 0) {
    return <p className="px-4 pt-1 pb-2.5 text-[11px] text-[var(--vsc-fg-faint)]">Henüz versiyon yok.</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5 px-2 pt-0.5 pb-1.5">
      {versions.slice(0, 8).map((v, i) => (
        <li key={v.id}>
          <button
            onClick={() => onRestoreVersion(v.id)}
            title="Bu versiyonu geri yükle"
            className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-[6px] text-left hover:bg-[var(--vsc-selected)]/60"
          >
            <span className="shrink-0 font-[family-name:var(--font-data)] text-[11px] font-medium text-[var(--vsc-accent-mono)]">
              {storageProvider === "github" ? v.id.slice(0, 7) : `v${versions.length - i}`}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--vsc-fg-muted)]">
              {storageProvider === "github" ? (v.note ?? "") : ""}
            </span>
            <span className="shrink-0 font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-faint)]">
              {formatRelativeDate(v.createdAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// design_handoff — IDE ana ekranı, sol panel: "Sketch" activity bar tab'ı
// artık FileTree'yi tek başına değil, sürükle-sıralanabilir/katlanabilir
// iki bölümü (SKETCH + VERSİYON GEÇMİŞİ) tek "ÇALIŞMA ALANI" panelinde
// birleştiriyor. "Git" tab'ındaki ProjectsPanel (commit/GitHub bağlama/tam
// versiyon listesi) ayrı kalıyor — burası yalnızca hızlı bakış.
export default function WorkspacePanel({
  files,
  activePath,
  onOpenFile,
  onAddFile,
  onRemoveFile,
  activeProjectId,
  storageProvider,
  onRestoreVersion,
}: WorkspacePanelProps) {
  const { sections, toggleCollapsed, reorder } = useWorkspaceSections(activeProjectId ?? "unsaved");
  const [draggingId, setDraggingId] = useState<SectionId | null>(null);
  const fileTreeRef = useRef<FileTreeHandle>(null);

  const visibleSections = sections.filter((s) => s.id !== "versions" || activeProjectId);

  return (
    <div className="flex h-full flex-col bg-[var(--vsc-sidebar)] text-[var(--vsc-fg)]">
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-[var(--vsc-border)] px-3">
        <span className="font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.14em] text-[var(--vsc-fg-muted)]">
          ÇALIŞMA ALANI
        </span>
        <SlidersHorizontal size={13} strokeWidth={2} className="text-[var(--vsc-fg-muted)]" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visibleSections.map((section, i) => (
          <div key={section.id} className={i > 0 ? "border-t border-[var(--vsc-border)] pt-1" : undefined}>
            {section.id === "sketch" ? (
              <SectionShell
                id="sketch"
                title="SKETCH"
                collapsed={section.collapsed}
                onToggleCollapsed={() => toggleCollapsed("sketch")}
                draggingId={draggingId}
                onDragStart={() => setDraggingId("sketch")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => draggingId && reorder(draggingId, "sketch")}
                onDragEnd={() => setDraggingId(null)}
                trailing={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fileTreeRef.current?.startAdding();
                    }}
                    title="Yeni dosya"
                    className="rounded p-0.5 text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg-active)]"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                  </button>
                }
              >
                <FileTree
                  ref={fileTreeRef}
                  files={files}
                  activePath={activePath}
                  onOpen={onOpenFile}
                  onAdd={onAddFile}
                  onRemove={onRemoveFile}
                />
              </SectionShell>
            ) : (
              activeProjectId && (
                <SectionShell
                  id="versions"
                  title="VERSİYON GEÇMİŞİ"
                  collapsed={section.collapsed}
                  onToggleCollapsed={() => toggleCollapsed("versions")}
                  draggingId={draggingId}
                  onDragStart={() => setDraggingId("versions")}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => draggingId && reorder(draggingId, "versions")}
                  onDragEnd={() => setDraggingId(null)}
                >
                  <VersionHistorySection
                    activeProjectId={activeProjectId}
                    storageProvider={storageProvider}
                    onRestoreVersion={onRestoreVersion}
                  />
                </SectionShell>
              )
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-[var(--vsc-border)] px-3 py-2.5 text-[11px] text-[var(--vsc-fg-faint)]">
        <GripVertical size={11} strokeWidth={2} />
        Bölümleri sürükleyerek sırala
      </div>
    </div>
  );
}
