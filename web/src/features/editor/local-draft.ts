import type { SketchFile } from "./sketch-files";
import type { LibraryDep } from "@/features/libraries/useLibraries";

export interface Draft {
  files: SketchFile[];
  fqbn: string;
  libraries: LibraryDep[];
}

function draftKey(projectId: string | null): string {
  return `espcode:draft:${projectId ?? "unsaved"}`;
}

// "Commit'le"/"Kaydet" ile onaylanmamış değişiklikler sayfa yenilenince
// kaybolmasın diye localStorage'a aynalanır — WorkspacePanel'in bölüm-durumu
// için kullandığı `espcode:workspace:*` deseniyle aynı (bkz. WorkspacePanel.tsx).
// Proje bazlı: id yoksa (henüz kaydedilmemiş sketch) "unsaved" anahtarı kullanılır.
export function loadDraft(projectId: string | null): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(projectId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(projectId: string | null, draft: Draft): void {
  try {
    localStorage.setItem(draftKey(projectId), JSON.stringify(draft));
  } catch {
    // kota/gizli sekme — sessizce yut, yalnızca taslak kalıcılığı kaybolur
  }
}

export function clearDraft(projectId: string | null): void {
  try {
    localStorage.removeItem(draftKey(projectId));
  } catch {
    // yok say
  }
}

export function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.fqbn === b.fqbn &&
    JSON.stringify(a.libraries) === JSON.stringify(b.libraries) &&
    JSON.stringify(a.files) === JSON.stringify(b.files)
  );
}
