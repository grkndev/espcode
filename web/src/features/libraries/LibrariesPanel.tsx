"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, Download, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLibraries, type LibraryDep, type LibrarySearchResult } from "./useLibraries";

export interface LibrariesPanelProps {
  libraries: LibraryDep[];
  onAdd: (name: string, version: string) => Promise<void>;
  onRemove: (name: string) => void;
}

// Kaldır/indir düğmeleri — hover'da belirmek yerine kalıcı bir arka planla
// her zaman görünür ve daha geniş bir hedefle tıklanabilir olduğu açık.
const ICON_BUTTON_CLASS =
  "flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#009398] text-white transition-colors hover:bg-[var(--vsc-border-ghost)] hover:text-[var(--vsc-fg-active)] disabled:opacity-40 disabled:pointer-events-none";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 px-1 font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.12em] text-[var(--vsc-fg-muted)]">
      {children}
    </div>
  );
}

function AddedRow({
  dep,
  info,
  onRemove,
}: {
  dep: LibraryDep;
  info?: LibrarySearchResult;
  onRemove: (name: string) => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-[8px] px-2.5 py-2 hover:bg-[var(--vsc-selected)]/60">
      <div className="min-w-0 flex-1">
        <span className="truncate text-[13px] text-[var(--vsc-fg)]">{dep.name}</span>
        {info?.sentence && (
          <p className="truncate text-[11px] text-[var(--vsc-fg-muted)]">{info.sentence}</p>
        )}
        {info?.author && (
          <p className="truncate font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-faint)]">
            {info.author}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-muted)]">
          {dep.version}
        </span>
        <button onClick={() => onRemove(dep.name)} title="Projeden kaldır" className={`${ICON_BUTTON_CLASS} bg-red-700`}>
          <Trash2 size={14} strokeWidth={2.25} />
        </button>
      </div>
    </li>
  );
}

function ResultRow({
  result,
  installing,
  installedVersion,
  onAdd,
}: {
  result: LibrarySearchResult;
  installing: boolean;
  /** Bu kütüphane projeye zaten eklenmişse sürümü, eklenmemişse null. */
  installedVersion: string | null;
  onAdd: (name: string, version: string) => void;
}) {
  const [version, setVersion] = useState(result.versions[0]?.version ?? "");
  const installed = installedVersion !== null;

  return (
    <li className="flex items-start gap-2 rounded-[8px] px-2.5 py-2 hover:bg-[var(--vsc-selected)]/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-[var(--vsc-fg-active)]">{result.name}</span>
          {result.compatible && (
            <span className="shrink-0 rounded-full bg-[var(--vsc-accent)]/15 px-1.5 py-[1px] font-[family-name:var(--font-data)] text-[9px] font-medium tracking-[0.04em] text-[var(--vsc-accent-mono)]">
              ESP32
            </span>
          )}
          {installed && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--vsc-success)]/15 px-1.5 py-[1px] font-[family-name:var(--font-data)] text-[9px] font-medium tracking-[0.04em] text-[var(--vsc-success)]">
              <CheckIcon size={9} strokeWidth={3} />
              Kurulu
            </span>
          )}
        </div>
        {result.sentence && (
          <p className="truncate text-[11px] text-[var(--vsc-fg-muted)]">{result.sentence}</p>
        )}
        {result.author && (
          <p className="truncate font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-faint)]">
            {result.author}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {installed ? (
          <span className="px-1 font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-muted)]">
            {installedVersion}
          </span>
        ) : (
          result.versions.length > 1 && (
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              title="Sürüm seç"
              className="rounded-[6px] border border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-1 py-1 font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg)] outline-none"
            >
              {result.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                </option>
              ))}
            </select>
          )
        )}
        <button
          onClick={() => onAdd(result.name, version)}
          disabled={installed || installing || !version}
          title={installed ? "Zaten projede kurulu" : "Projeye ekle"}
          className={ICON_BUTTON_CLASS}
        >
          {installing ? (
            <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
          ) : (
            <Download size={14} strokeWidth={2.25} />
          )}
        </button>
      </div>
    </li>
  );
}

// Sidebar'daki "Kütüphaneler" panel — Arduino'nun resmi kayıt defterinde
// (downloads.arduino.cc/libraries) arama yapar (bkz. api/src/libraries).
// Ekleme/kaldırma state'i (libraries, files) burada değil IdeShell'de yaşıyor
// — WorkspacePanel'in dosya listesiyle aynı desen (bkz. onAddFile/onRemoveFile).
export default function LibrariesPanel({ libraries, onAdd, onRemove }: LibrariesPanelProps) {
  const { results, searching, bundled, search, loadBundled, getInfo } = useLibraries();
  const [query, setQuery] = useState("");
  const [installingName, setInstallingName] = useState<string | null>(null);
  const [infoByName, setInfoByName] = useState<Map<string, LibrarySearchResult>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadBundled();
    void search("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca ilk mount'ta, search/loadBundled referansı stabil değil
  }, []);

  // "PROJEDE" satırlarına açıklama/yazar eklemek için — arama sonuçlarında
  // bulunmayabilirler (farklı bir sorguyla eklenmiş olabilirler), bu yüzden
  // isme göre ayrı bir uçtan toplu getirilir (bkz. useLibraries.getInfo).
  useEffect(() => {
    const names = libraries.map((l) => l.name);
    if (names.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- libraries boşalınca eski açıklamalar sıfırlanır, sorgu kütüphanesi yok
      setInfoByName(new Map());
      return;
    }
    void getInfo(names).then((found) => setInfoByName(new Map(found.map((f) => [f.name, f]))));
  }, [libraries, getInfo]);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(next), 250);
  }

  async function handleAdd(name: string, version: string) {
    setInstallingName(name);
    try {
      await onAdd(name, version);
    } catch (err) {
      toast.error("Kütüphane eklenemedi", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setInstallingName(null);
    }
  }

  const addedVersionByName = new Map(libraries.map((l) => [l.name, l.version]));

  return (
    <div className="flex h-full flex-col bg-[var(--vsc-sidebar)] text-[var(--vsc-fg)]">
      <div className="flex h-[38px] shrink-0 items-center border-b border-[var(--vsc-border)] px-3">
        <span className="font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.14em] text-[var(--vsc-fg-muted)]">
          KÜTÜPHANELER
        </span>
      </div>

      <div className="border-b border-[var(--vsc-border)] p-2.5">
        <div className="flex items-center gap-2 rounded-[8px] border border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-2.5 py-1.5">
          <Search size={13} strokeWidth={2.25} className="shrink-0 text-[var(--vsc-fg-muted)]" />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Kütüphane ara…"
            className="w-full bg-transparent text-xs text-[var(--vsc-fg-active)] outline-none placeholder:text-[var(--vsc-fg-muted)]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {libraries.length > 0 && (
          <div className="mb-3">
            <SectionLabel>KURULMUŞ</SectionLabel>
            <ul className="flex flex-col gap-0.5">
              {libraries.map((dep) => (
                <AddedRow key={dep.name} dep={dep} info={infoByName.get(dep.name)} onRemove={onRemove} />
              ))}
            </ul>
          </div>
        )}

        <div className="mb-3">
          <SectionLabel>SONUÇLAR</SectionLabel>
          {searching && <p className="px-1 text-xs text-[var(--vsc-fg-muted)]">Yükleniyor…</p>}
          {!searching && results.length === 0 && (
            <p className="px-1 text-xs text-[var(--vsc-fg-muted)]">Kütüphane bulunamadı.</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {results.map((r) => (
              <ResultRow
                key={r.name}
                result={r}
                installing={installingName === r.name}
                installedVersion={addedVersionByName.get(r.name) ?? null}
                onAdd={handleAdd}
              />
            ))}
          </ul>
        </div>

        {bundled.length > 0 && (
          <div>
            <SectionLabel>KART İLE GELEN</SectionLabel>
            <ul className="flex flex-wrap gap-1 px-1">
              {bundled.map((name) => (
                <li
                  key={name}
                  className="rounded-[6px] bg-[var(--vsc-selected)] px-2 py-1 font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-muted)]"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
