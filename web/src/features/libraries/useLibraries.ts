import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-config";

export interface LibraryDep {
  name: string;
  version: string;
}

export interface LibraryVersionInfo {
  version: string;
  size: number;
  checksum: string;
  url: string;
  archiveFileName: string;
  dependencies: { name: string }[];
}

export interface LibrarySearchResult {
  name: string;
  author: string;
  sentence: string;
  category: string;
  architectures: string[];
  providesIncludes: string[];
  versions: LibraryVersionInfo[]; // en yeniden en eskiye, en fazla 5
  compatible: boolean; // architectures 'esp32' ya da '*' içeriyor
}

export interface ResolvedLibrary {
  name: string;
  version: string;
  dir: string;
  includes: string[]; // diskte gerçekten bulunan .h/.hpp adları — otomatik #include için
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message?.[0] ?? body.error ?? `request_failed:${res.status}`);
  }
  return res.json();
}

// api/src/libraries — arama sunucu tarafında (tam Arduino kayıt defteri
// üzerinde), bu yüzden useProjects.ts'teki gibi sonuç bir state, arama bir
// eylem. Kurulum (install) diski yazan tarafta ide-api'de olur; burası
// yalnızca tetikler ve sonucu döner — projeye eklemek (state + #include)
// IdeShell'in sorumluluğunda (files/libraries state'i orada yaşıyor).
export function useLibraries() {
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [bundled, setBundled] = useState<string[]>([]);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await apiFetch(`/api/libraries/search?q=${encodeURIComponent(q)}&limit=40`);
      setResults(await json<LibrarySearchResult[]>(res));
    } finally {
      setSearching(false);
    }
  }, []);

  const loadBundled = useCallback(async () => {
    const res = await apiFetch("/api/libraries/bundled");
    setBundled(await json<string[]>(res));
  }, []);

  const install = useCallback(async (name: string, version: string): Promise<ResolvedLibrary[]> => {
    const res = await apiFetch("/api/libraries/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, version }),
    });
    const { resolved } = await json<{ resolved: ResolvedLibrary[] }>(res);
    return resolved;
  }, []);

  // Projeye eklenmiş kütüphanelerin açıklama/yazar bilgisi — arama
  // sonuçlarında görünmeseler bile (farklı bir sorguyla eklenmiş olabilirler)
  // isme göre toplu getirir.
  const getInfo = useCallback(async (names: string[]): Promise<LibrarySearchResult[]> => {
    if (names.length === 0) return [];
    const res = await apiFetch(`/api/libraries/info?names=${encodeURIComponent(names.join(","))}`);
    return json<LibrarySearchResult[]>(res);
  }, []);

  return { results, searching, bundled, search, loadBundled, install, getInfo };
}
