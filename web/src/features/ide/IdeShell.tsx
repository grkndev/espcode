"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { checkSerialSupport } from "@/lib/serial/support";
import { serialSession } from "@/features/serial/SerialSession";
import { useSerialStore } from "@/features/serial/useSerialStore";
import {
  getChipInfo,
  flashFirmware,
  FLASH_STAGE_LABEL,
  type FlashStage,
} from "@/features/flash/flasher";
import { useBuild } from "@/features/build/useBuild";
import { useAuth } from "@/features/auth/useAuth";
import ProjectsPanel, { type PendingGithubInstall } from "@/features/projects/ProjectsPanel";
import { useProjects } from "@/features/projects/useProjects";
import { describeSerialError } from "@/lib/serial/errors";
import { type TerminalHandle } from "@/features/monitor/Terminal";
import { type PlotterHandle } from "@/features/plotter/Plotter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import Editor from "@/features/editor/Editor";
import FileTree from "@/features/editor/FileTree";
import TabBar from "@/features/editor/TabBar";
import Breadcrumb from "@/features/editor/Breadcrumb";
import {
  type SketchFile,
  PRIMARY_FILE,
  createDefaultSketch,
  updateFileContent,
  addFile,
  removeFile,
} from "@/features/editor/sketch-files";
import TopBar from "./TopBar";
import { BOARDS } from "./board-match";
import { defaultOptionValues } from "./board-options";
import StatusBar from "./StatusBar";
import BottomPanel, { type LineEnding } from "./BottomPanel";
import ActivityBar, { type SidePanel } from "./ActivityBar";
import SettingsPanel from "./SettingsPanel";

// frontend.plan.md §5.3 — iki başarısız deneme sonrası manuel moda geç
const MANUAL_MODE_THRESHOLD = 2;

const LINE_ENDINGS: Record<LineEnding, string> = {
  none: "",
  lf: "\n",
  cr: "\r",
  crlf: "\r\n",
};

export default function IdeShell() {
  const support = checkSerialSupport();
  const { state, chipInfo, error, connecting, connect, setChipInfo, setError } =
    useSerialStore();
  const build = useBuild();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loadProject } = useProjects();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [pendingGithubInstall, setPendingGithubInstall] = useState<PendingGithubInstall | null>(
    null,
  );

  const [fqbn, setFqbn] = useState(BOARDS[2].fqbn); // esp32:esp32:esp32s3
  const [boardOptions, setBoardOptions] = useState<Record<string, string>>(() =>
    defaultOptionValues(BOARDS[2].fqbn),
  );
  const [sidePanel, setSidePanel] = useState<SidePanel | null>("library");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState("monitor");
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);

  // frontend.plan.md §3.2 — çoklu dosya sketch modeli
  const [files, setFiles] = useState<SketchFile[]>(createDefaultSketch);
  const [openPaths, setOpenPaths] = useState<string[]>([PRIMARY_FILE]);
  const [activePath, setActivePath] = useState(PRIMARY_FILE);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [syncFailCount, setSyncFailCount] = useState(0);

  const [flashing, setFlashing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [flashStage, setFlashStage] = useState<FlashStage | null>(null);

  const [baud, setBaud] = useState(115200);
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [sendValue, setSendValue] = useState("");
  const [sendHistory, setSendHistory] = useState<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const plotterRef = useRef<PlotterHandle>(null);
  const pendingLineRef = useRef("");

  const isMonitoring = state === "monitoring";
  const isConnected = state !== "disconnected";
  // files boşsa (normalde olmamalı — handleActivateProject bunu engelliyor)
  // activeFile.content okuması IDE'yi çökertmesin diye boş bir dosyaya düşülür.
  const activeFile = files.find((f) => f.path === activePath) ?? files[0] ?? { path: PRIMARY_FILE, content: "" };

  const appendLog = (line: string) => setLogLines((prev) => [...prev.slice(-199), line]);

  // Kart bağlıyken gelen tüm seri veri buraya akar — startMonitor()
  // çağrılmadığı sürece SerialSession hiç okuma döngüsü başlatmaz. Terminal
  // ham parçayı olduğu gibi alır; plotter tam satır ister (§7.1).
  useEffect(() => {
    return serialSession.subscribeData((chunk) => {
      terminalRef.current?.write(chunk);

      pendingLineRef.current += chunk;
      const lines = pendingLineRef.current.split(/\r\n|\r|\n/);
      pendingLineRef.current = lines.pop() ?? "";
      for (const line of lines) plotterRef.current?.pushLine(line);
    });
  }, []);

  // Tüm geçici mesajlar toast ile veriliyor — ayrı bir banner alanı yok;
  // store'un kendi içinde (ör. requestPort iptali) veya handler'larda
  // setError çağrılan her yerde buradan tek noktadan toast'lanır.
  useEffect(() => {
    if (error) toast.error("Hata", { description: error });
  }, [error]);

  useEffect(() => {
    if (!flashing) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    navigator.wakeLock?.request("screen").then(
      (lock) => (wakeLockRef.current = lock),
      () => {},
    );
    return () => {
      window.removeEventListener("beforeunload", guard);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [flashing]);

  // Editör artık ana sayfa değil (app/page.tsx dashboard'a çevrildi) — girişsiz
  // buraya doğrudan URL ile gelen kullanıcıyı dashboard/login kapısına yolla.
  useEffect(() => {
    if (!auth.loading && !auth.user) router.replace("/");
  }, [auth.loading, auth.user, router]);

  // Dashboard'dan "?project=<id>" ile açılan proje varsa gerçek kaynağından
  // (postgres taslağı ya da bağlı GitHub repo'su) o anki dosyaları yükle.
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (!projectId || !auth.user) return;
    let cancelled = false;
    void loadProject(projectId)
      .then((detail) => {
        if (cancelled) return;
        handleActivateProject(projectId, detail.files, detail.fqbn);
      })
      .catch(() => {
        if (cancelled) return;
        handleActivateProject(projectId);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca URL'deki proje id'si ve giriş durumu değiştiğinde tekrar çalışsın
  }, [searchParams, auth.user]);

  // GitHub App kurulum akışından dönüş — §3.1 adım 3-4. Callback API'de
  // gerçekleşir, buraya yalnızca sonucu taşıyan query param'larla döner.
  // Projeyi aktive eden effect zaten çalışacak (?project= burada da var);
  // bu effect yalnızca repo seçim dialoğunu tetikleyecek bilgiyi taşır.
  useEffect(() => {
    const github = searchParams.get("github");
    const installation = searchParams.get("installation");
    const projectId = searchParams.get("project");
    if (github !== "installed" || !installation || !projectId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL'den gelen tek seferlik yönlendirme sonucu, sorgu kütüphanesi yok
    setPendingGithubInstall({ projectId, installationId: installation });
    setSidePanel("projects");
    const next = new URLSearchParams(searchParams);
    next.delete("github");
    next.delete("installation");
    router.replace(`/editor?${next.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca URL'deki github/installation/project param'ları değiştiğinde tekrar çalışsın
  }, [searchParams]);

  async function handleConnect() {
    setError(null);
    await connect();
    const port = serialSession.getPort();
    if (!port) return; // requestPort iptal edildi ya da başarısız oldu, hata store'da

    try {
      const chipInfo = await getChipInfo(port, appendLog);
      setChipInfo(chipInfo);
      setSyncFailCount(0);
      setBoardDialogOpen(true); // bağlantı + tespit bitince kart seçim dialoğu açılır
    } catch (err) {
      const nextCount = syncFailCount + 1;
      setSyncFailCount(nextCount);
      setError(describeSerialError(err));
      if (nextCount >= MANUAL_MODE_THRESHOLD) {
        toast.warning("Kart yanıt vermiyor", {
          description:
            "Kartın üzerindeki BOOT düğmesini basılı tut, EN (veya RST) düğmesine bir kez bas, sonra BOOT'u bırak. Ardından tekrar bağlanmayı dene.",
          duration: 8000,
        });
      }
    }
  }

  // Bağlı değilken tıklamak bağlanır (bağlanınca dialog otomatik açılır);
  // zaten bağlıyken tıklamak sadece kart değiştirme dialoğunu açar.
  function handleBoardTriggerClick() {
    if (isConnected) {
      setBoardDialogOpen(true);
    } else {
      handleConnect();
    }
  }

  function handleSelectBoard(next: string) {
    setFqbn(next);
    setBoardOptions(defaultOptionValues(next)); // seçenekler karta göre değişir, sıfırlanır
    setBoardDialogOpen(false);
  }

  function handleOptionChange(key: string, value: string) {
    setBoardOptions((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenFile(path: string) {
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
  }

  function handleCloseTab(path: string) {
    setOpenPaths((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activePath === path) {
        setActivePath(next[next.length - 1] ?? PRIMARY_FILE);
      }
      return next.length ? next : [PRIMARY_FILE];
    });
  }

  function handleAddFile(path: string) {
    setFiles((prev) => addFile(prev, path));
    handleOpenFile(path);
  }

  function handleRemoveFile(path: string) {
    setFiles((prev) => removeFile(prev, path));
    handleCloseTab(path);
  }

  function handleSelectPanel(panel: SidePanel) {
    setSidePanel((prev) => (prev === panel ? null : panel));
  }

  // master.plan.md §6 — proje oluşturma/yükleme/versiyon geri yükleme, hepsi
  // aynı yoldan geçer: editör içeriğini değiştirir + hangi projenin aktif
  // olduğunu işaretler (sonraki "Derle ve Yükle" o projeye versiyon yazar).
  function handleActivateProject(id: string | null, newFiles?: SketchFile[], newFqbn?: string) {
    setActiveProjectId(id);
    if (newFiles && newFiles.length === 0) {
      // GitHub'a bağlı projelerde sketch.yaml + her dosya ayrı commit olarak
      // yazılıyor (atomik değil) — split'in ilk commit'i yalnızca
      // sketch.yaml içerebilir, o versiyona geri dönmek boş bir dosya
      // listesi üretir. Editörü boşaltmak yerine mevcut haliyle bırakıp
      // kullanıcıyı uyarmak, activeFile'ın undefined kalıp çökmesinden iyi.
      toast.warning("Bu versiyon dosya içermiyor", {
        description: "Muhtemelen ara bir commit — geri yükleme atlandı.",
      });
    } else if (newFiles) {
      setFiles(newFiles);
      const stillOpen = newFiles.some((f) => f.path === activePath);
      setOpenPaths(stillOpen ? [activePath] : [PRIMARY_FILE]);
      setActivePath(stillOpen ? activePath : PRIMARY_FILE);
    }
    if (newFqbn) {
      setFqbn(newFqbn);
      setBoardOptions(defaultOptionValues(newFqbn));
    }
  }

  // Yalnızca derle (Arduino IDE'nin "Verify" karşılığı) — kartı yazmaz,
  // sadece hataları/uyarıları editöre iliştirir.
  async function handleCompile() {
    setTerminalOpen(true);
    setBottomTab("build");
    setLogLines([]); // her işlemde derleme çıktısı sıfırdan başlasın
    try {
      const result = await build.compile(files, fqbn, boardOptions);
      toast.success("Derleme tamamlandı", {
        description: `${result.flashBytes.toLocaleString("tr-TR")} bayt`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Derleme başarısız";
      toast.error("Derleme başarısız", { description: message });
    }
  }

  // frontend.plan.md §8 — Faz 5: derle (POST /api/compile + SSE) → merged.bin'i
  // 0x0'a yaz.
  async function handleCompileAndFlash() {
    const port = serialSession.getPort();
    if (!port) return;
    setTerminalOpen(true);
    setBottomTab("build");
    setLogLines([]); // her işlemde derleme çıktısı sıfırdan başlasın

    // §6 "Flash sonrası versiyon kaydı" — yalnızca girişliyken ve aktif proje
    // varken; "Derle" (yalnızca doğrula) bu satırı hiç göndermiyor.
    const projectId = auth.user && activeProjectId ? activeProjectId : undefined;

    let result;
    try {
      result = await build.compile(files, fqbn, boardOptions, projectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Derleme başarısız";
      toast.error("Derleme başarısız", { description: message });
      return;
    }

    setFlashing(true);
    // frontend.plan.md §4.1 — monitör açıkken flash: devri kullanıcıya
    // göstermeden durdur → yaz → geri başlat.
    const wasMonitoring = isMonitoring;
    if (wasMonitoring) await serialSession.stopMonitor();
    serialSession.beginFlashing();

    try {
      await flashFirmware(
        port,
        { data: result.binary, address: 0 },
        setProgress,
        appendLog,
        setFlashStage,
      );
      toast.success("Yükleme tamamlandı", {
        description:
          projectId && result.versionSaved === "ok"
            ? "Kart yeniden başlatıldı. Proje kaydedildi."
            : "Kart yeniden başlatıldı.",
      });
      if (projectId && result.versionSaved && result.versionSaved !== "ok") {
        const description =
          result.versionSaved === "conflict"
            ? "GitHub'da bu dosyalar elden değişmiş — Commit'le ile üzerine yazmayı onaylaman gerekiyor."
            : result.versionSaved === "link_broken"
              ? "GitHub bağlantısı koptu — projeyi yeniden bağla."
              : "Kod kaydedilemedi, ama kart yazıldı.";
        toast.warning("Proje kaydedilemedi", { description });
      }
    } catch (err) {
      toast.error("Yükleme başarısız", { description: describeSerialError(err) });
    } finally {
      setFlashing(false);
      setProgress(null);
      setFlashStage(null);
      serialSession.endFlashing();
      if (wasMonitoring) await serialSession.startMonitor(baud).catch(() => {});
    }
  }

  function handleClearMonitor() {
    terminalRef.current?.clear();
    plotterRef.current?.clear();
  }

  async function handleToggleMonitor() {
    setError(null);
    try {
      if (isMonitoring) {
        await serialSession.stopMonitor();
      } else {
        handleClearMonitor();
        await serialSession.startMonitor(baud);
      }
    } catch (err) {
      setError(describeSerialError(err));
    }
  }

  // §4.3 — SerialPort açıkken baud değiştirilemez, kapat → yeni baud ile aç.
  async function handleBaudChange(next: number) {
    setBaud(next);
    if (isMonitoring) {
      await serialSession.stopMonitor();
      await serialSession.startMonitor(next).catch((err) => setError(describeSerialError(err)));
    }
  }

  async function handleSend() {
    if (!sendValue) return;
    await serialSession.send(sendValue + LINE_ENDINGS[lineEnding]).catch((err) => {
      setError(describeSerialError(err));
    });
    setSendHistory((prev) => [...prev, sendValue].slice(-100));
    historyIndexRef.current = null;
    setSendValue("");
  }

  function handleSendKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (sendHistory.length === 0) return;
      const idx =
        historyIndexRef.current === null ? sendHistory.length - 1 : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = idx;
      setSendValue(sendHistory[idx]);
    }
  }

  // Girişsizken yönlendirme (yukarıdaki effect) tamamlanana kadar tam IDE
  // kabuğunun bir anlığına çakmasını önle.
  if (auth.loading) return null;
  if (!auth.user) return null;

  if (!support.ok) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded border border-[var(--vsc-fg-muted)] px-4 py-3 text-sm text-[var(--vsc-fg-muted)]">
          {support.reason === "no_api"
            ? "Bu tarayıcı karta yazmayı desteklemiyor. Chrome, Edge veya Firefox 151+ kullan — ya da .bin dosyasını indirip kendi aracınla yaz."
            : "Karta yazmak için güvenli bağlantı gerekiyor. Adresi https:// ile aç."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        fqbn={fqbn}
        chipInfo={chipInfo}
        connected={isConnected}
        connecting={connecting}
        dialogOpen={boardDialogOpen}
        onDialogOpenChange={setBoardDialogOpen}
        onTriggerClick={handleBoardTriggerClick}
        onSelectBoard={handleSelectBoard}
        terminalOpen={terminalOpen}
        onToggleTerminal={() => setTerminalOpen((v) => !v)}
        compiling={build.status === "compiling"}
        flashing={flashing}
        onCompile={handleCompile}
        onCompileAndFlash={handleCompileAndFlash}
        user={auth.user}
        onLogin={auth.login}
      />

      <div className="flex min-h-0 flex-1">
        <ActivityBar active={sidePanel} onSelect={handleSelectPanel} />

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          {sidePanel && (
            <>
              <ResizablePanel defaultSize="18" minSize="14" maxSize="30">
                {sidePanel === "library" && (
                  <FileTree
                    files={files}
                    activePath={activePath}
                    onOpen={handleOpenFile}
                    onAdd={handleAddFile}
                    onRemove={handleRemoveFile}
                  />
                )}
                {sidePanel === "projects" && (
                  <ProjectsPanel
                    user={auth.user}
                    authLoading={auth.loading}
                    onLogin={auth.login}
                    onLogout={auth.logout}
                    files={files}
                    fqbn={fqbn}
                    activeProjectId={activeProjectId}
                    onActivate={handleActivateProject}
                    pendingGithubInstall={pendingGithubInstall}
                    onConsumePendingGithubInstall={() => setPendingGithubInstall(null)}
                  />
                )}
                {sidePanel === "settings" && (
                  <SettingsPanel
                    fqbn={fqbn}
                    chipInfo={chipInfo}
                    boardOptions={boardOptions}
                    onOptionChange={handleOptionChange}
                  />
                )}
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          <ResizablePanel minSize="40">
            <ResizablePanelGroup orientation="vertical" className="h-full">
              <ResizablePanel defaultSize="70" minSize="30">
                <div className="flex h-full flex-col">
                  <TabBar
                    openPaths={openPaths}
                    activePath={activePath}
                    onSelect={setActivePath}
                    onClose={handleCloseTab}
                  />
                  <Breadcrumb path={activePath} />
                  <div className="min-h-0 flex-1">
                    <Editor
                      key={activeFile.path}
                      value={activeFile.content}
                      onChange={(content) =>
                        setFiles((prev) => updateFileContent(prev, activeFile.path, content))
                      }
                      diagnostics={build.diagnostics.filter(
                        (d) => d.file === activeFile.path.split("/").pop(),
                      )}
                    />
                  </div>
                </div>
              </ResizablePanel>

              {terminalOpen && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize="30" minSize="15">
                    <BottomPanel
                      activeTab={bottomTab}
                      onActiveTabChange={setBottomTab}
                      terminalRef={terminalRef}
                      plotterRef={plotterRef}
                      isMonitoring={isMonitoring}
                      canMonitor={isConnected && !flashing}
                      baud={baud}
                      onBaudChange={handleBaudChange}
                      onToggleMonitor={handleToggleMonitor}
                      onClearMonitor={handleClearMonitor}
                      sendValue={sendValue}
                      onSendValueChange={setSendValue}
                      onSendKeyDown={handleSendKeyDown}
                      lineEnding={lineEnding}
                      onLineEndingChange={setLineEnding}
                      onSend={handleSend}
                      buildLog={build.log + logLines.join("")}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <StatusBar
        state={state}
        fqbn={fqbn}
        baud={baud}
        buildStatus={build.status}
        flashProgress={progress}
        flashStageLabel={flashStage ? FLASH_STAGE_LABEL[flashStage] : null}
      />
    </div>
  );
}
