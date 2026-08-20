"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { API_BASE, apiFetch } from "@/lib/api-config";
import { parseDiagnostics, type Diagnostic } from "./parse-gcc-output";
import type { SketchFile } from "@/features/editor/sketch-files";
import { serialSession } from "@/features/serial/SerialSession";
import { flashFirmware, type FlashStage } from "@/features/flash/flasher";
import { describeSerialError } from "@/lib/serial/errors";
import type { LibraryDep } from "@/features/libraries/useLibraries";

export type VersionSaved = "ok" | "conflict" | "link_broken" | "error" | null;
export type BuildStatus = "idle" | "compiling" | "done" | "failed";

export interface BuildResult {
  binary: Uint8Array;
  flashBytes: number;
  elfBytes: number;
  buildKey: string;
  versionSaved: VersionSaved;
}

export type NotificationKind = "compile" | "flash";
export type NotificationStatus = "success" | "failure" | "warning";

export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  status: NotificationStatus;
  message: string;
  description?: string;
  timestamp: number;
  read: boolean;
}

interface BuildStoreState {
  status: BuildStatus;
  log: string;
  diagnostics: Diagnostic[];
  flashing: boolean;
  progress: number | null;
  flashStage: FlashStage | null;
  notifications: NotificationEntry[];
  // Son başarılı derlemenin build key'i — TopBar'daki ".bin indir" butonu
  // GET /api/builds/:key/download?asset=bin'e bunu geçiyor. Yeni bir derleme
  // başlarken sıfırlanmıyor: eski binary hâlâ geçerli/indirilebilir, yalnızca
  // yeni bir derleme BAŞARIYLA bitince güncelleniyor.
  lastBuildKey: string | null;

  compile: (
    files: SketchFile[],
    fqbn: string,
    options: Record<string, string>,
    libraries: LibraryDep[],
    projectId?: string,
    opts?: { notifyOnSuccess?: boolean },
  ) => Promise<BuildResult>;
  compileAndFlash: (
    files: SketchFile[],
    fqbn: string,
    options: Record<string, string>,
    libraries: LibraryDep[],
    projectId: string | undefined,
    baud: number,
  ) => Promise<void>;
  markAllRead: () => void;
}

const MAX_NOTIFICATIONS = 20;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// frontend.plan.md §8/§4 — derleme + flash orkestrasyonu artık IdeShell'e
// değil bu global store'a bağlı. SerialSession'ın React ağacı dışında
// yaşama deseniyle aynı (bkz. features/serial/SerialSession.ts): kullanıcı
// Dashboard'a geçse bile devam eden iş ve tamamlanma toast'ı/bildirimi her
// sayfada çalışır — component unmount olduğu için sessizce kaybolmaz.
export const useBuildStore = create<BuildStoreState>()(
  persist(
    (set, get) => {
      function pushNotification(entry: Omit<NotificationEntry, "id" | "timestamp" | "read">) {
        set((s) => ({
          notifications: [
            { ...entry, id: crypto.randomUUID(), timestamp: Date.now(), read: false },
            ...s.notifications,
          ].slice(0, MAX_NOTIFICATIONS),
        }));
      }

      function appendLog(line: string) {
        set((s) => ({ log: s.log + line }));
      }

      return {
        status: "idle",
        log: "",
        diagnostics: [],
        flashing: false,
        progress: null,
        flashStage: null,
        notifications: [],
        lastBuildKey: null,

        compile: async (files, fqbn, options, libraries, projectId, opts) => {
          const notifyOnSuccess = opts?.notifyOnSuccess ?? true;
          set({ status: "compiling", log: "", diagnostics: [] });

          const fail = (message: string): never => {
            set({ status: "failed" });
            toast.error("Derleme başarısız", { description: message });
            pushNotification({
              kind: "compile",
              status: "failure",
              message: "Derleme başarısız",
              description: message,
            });
            throw new Error(message);
          };

          let res: Response;
          try {
            res = await apiFetch("/api/compile", {
              method: "POST", // master.plan.md §5 — projectId'nin işlenmesi için oturum çerezi gerekir
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ files, fqbn, options, libraries, projectId }),
            });
          } catch (err) {
            return fail(err instanceof Error ? err.message : "compile_request_failed");
          }

          if (res.status === 429) {
            const body = await res.json().catch(() => ({}));
            return fail(`Sunucu yoğun, ${body.retryAfter ?? 60} sn sonra tekrar dene.`);
          }
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return fail(body.message?.[0] ?? body.error ?? `compile_request_failed:${res.status}`);
          }

          const data = await res.json();

          function finish(result: BuildResult): BuildResult {
            set({ status: "done", diagnostics: parseDiagnostics(get().log), lastBuildKey: result.buildKey });
            if (notifyOnSuccess) {
              const description = `${result.flashBytes.toLocaleString("tr-TR")} bayt`;
              toast.success("Derleme tamamlandı", { description });
              pushNotification({
                kind: "compile",
                status: "success",
                message: "Derleme tamamlandı",
                description,
              });
            }
            return result;
          }

          if (data.cached) {
            appendLog(data.log ?? "");
            return finish({
              binary: base64ToBytes(data.binBase64),
              flashBytes: data.flashBytes,
              elfBytes: data.elfBytes,
              buildKey: data.buildKey,
              versionSaved: data.versionSaved ?? null,
            });
          }

          return new Promise<BuildResult>((resolve, reject) => {
            const url = `${API_BASE}/api/jobs/${data.jobId}/stream`;
            const es = new EventSource(url, { withCredentials: true });

            es.addEventListener("log", (e) => {
              const { line } = JSON.parse((e as MessageEvent).data);
              appendLog(line);
            });
            es.addEventListener("done", (e) => {
              const result = JSON.parse((e as MessageEvent).data);
              es.close();
              resolve(
                finish({
                  binary: base64ToBytes(result.binBase64),
                  flashBytes: result.flashBytes,
                  elfBytes: result.elfBytes,
                  buildKey: result.buildKey,
                  versionSaved: result.versionSaved ?? null,
                }),
              );
            });
            es.addEventListener("failed", (e) => {
              const { error } = JSON.parse((e as MessageEvent).data);
              es.close();
              try {
                fail(error ?? "compile_failed");
              } catch (err) {
                reject(err);
              }
            });
            es.onerror = () => {
              es.close();
              try {
                fail("Bağlantı koptu");
              } catch (err) {
                reject(err);
              }
            };
          });
        },

        compileAndFlash: async (files, fqbn, options, libraries, projectId, baud) => {
          const port = serialSession.getPort();
          if (!port) return;

          let result: BuildResult;
          try {
            result = await get().compile(files, fqbn, options, libraries, projectId, { notifyOnSuccess: false });
          } catch {
            return; // compile() zaten kendi hata toast'ını/bildirimini bastı
          }

          set({ flashing: true });
          // frontend.plan.md §4.1 — monitör açıkken flash: devri kullanıcıya
          // göstermeden durdur → yaz → geri başlat.
          const wasMonitoring = serialSession.getState() === "monitoring";
          if (wasMonitoring) await serialSession.stopMonitor();
          serialSession.beginFlashing();

          try {
            await flashFirmware(
              port,
              { data: result.binary, address: 0 },
              (fraction) => set({ progress: fraction }),
              appendLog,
              (stage) => set({ flashStage: stage }),
            );
            const description =
              projectId && result.versionSaved === "ok"
                ? "Kart yeniden başlatıldı. Proje kaydedildi."
                : "Kart yeniden başlatıldı.";
            toast.success("Yükleme tamamlandı", { description });
            pushNotification({ kind: "flash", status: "success", message: "Yükleme tamamlandı", description });

            if (projectId && result.versionSaved && result.versionSaved !== "ok") {
              const warnDescription =
                result.versionSaved === "conflict"
                  ? "GitHub'da bu dosyalar elden değişmiş — Commit'le ile üzerine yazmayı onaylaman gerekiyor."
                  : result.versionSaved === "link_broken"
                    ? "GitHub bağlantısı koptu — projeyi yeniden bağla."
                    : "Kod kaydedilemedi, ama kart yazıldı.";
              toast.warning("Proje kaydedilemedi", { description: warnDescription });
              pushNotification({
                kind: "flash",
                status: "warning",
                message: "Proje kaydedilemedi",
                description: warnDescription,
              });
            }
          } catch (err) {
            const message = describeSerialError(err);
            toast.error("Yükleme başarısız", { description: message });
            pushNotification({ kind: "flash", status: "failure", message: "Yükleme başarısız", description: message });
          } finally {
            set({ flashing: false, progress: null, flashStage: null });
            serialSession.endFlashing();
            if (wasMonitoring) await serialSession.startMonitor(baud).catch(() => {});
          }
        },

        markAllRead: () =>
          set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      };
    },
    {
      name: "espcode-notifications",
      // yalnızca bildirim geçmişi VE son build key kalıcı — status/log/
      // flashing gibi anlık alanlar sayfa yenilenince yanlışlıkla "hâlâ
      // sürüyor" görünmesin diye persist edilmez. lastBuildKey ayrık: artifact
      // sunucuda kalıcı olduğu için (bkz. artifact-store.service.ts, TTL yok)
      // sayfa yenilenince ".bin indir" butonunun devre dışı kalması gereksiz.
      partialize: (state) => ({ notifications: state.notifications, lastBuildKey: state.lastBuildKey }),
    },
  ),
);

// Flash sırasında sekme kapatma/yenileme uyarısı + ekranın kilitlenmesini
// engelleme — IdeShell'in mount durumuna değil doğrudan store'a bağlı,
// kullanıcı Dashboard'a geçse bile korumalar geçerli kalır.
if (typeof window !== "undefined") {
  let wakeLock: WakeLockSentinel | null = null;
  const guard = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = "";
  };
  useBuildStore.subscribe((state, prev) => {
    if (state.flashing === prev.flashing) return;
    if (state.flashing) {
      window.addEventListener("beforeunload", guard);
      navigator.wakeLock?.request("screen").then(
        (lock) => (wakeLock = lock),
        () => {},
      );
    } else {
      window.removeEventListener("beforeunload", guard);
      wakeLock?.release().catch(() => {});
      wakeLock = null;
    }
  });
}
