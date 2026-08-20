"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { InfoIcon, XIcon } from "lucide-react";
import { checkSerialSupport } from "@/lib/serial/support";
import { serialSession } from "@/features/serial/SerialSession";
import { useSerialStore } from "@/features/serial/useSerialStore";
import { getChipInfo, FLASH_STAGE_LABEL } from "@/features/flash/flasher";
import { useBuildStore } from "@/features/build/useBuildStore";
import { useAuth } from "@/features/auth/useAuth";
import ProjectsPanel, { type PendingGithubInstall } from "@/features/projects/ProjectsPanel";
import { useProjects } from "@/features/projects/useProjects";
import LibrariesPanel from "@/features/libraries/LibrariesPanel";
import { useLibraries, type LibraryDep } from "@/features/libraries/useLibraries";
import { describeSerialError } from "@/lib/serial/errors";
import { type TerminalHandle } from "@/features/monitor/Terminal";
import { type PlotterHandle } from "@/features/plotter/Plotter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import Editor from "@/features/editor/Editor";
import WorkspacePanel from "./WorkspacePanel";
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
import { loadDraft, saveDraft, clearDraft, draftsEqual, type Draft } from "@/features/editor/local-draft";
import TopBar from "./TopBar";
import { BOARDS } from "./board-match";
import { defaultOptionValues } from "./board-options";
import StatusBar from "./StatusBar";
import BottomPanel, { type LineEnding } from "./BottomPanel";
import ActivityBar, { type SidePanel } from "./ActivityBar";
import SettingsPanel from "./SettingsPanel";
import EditorSettingsPanel from "./EditorSettingsPanel";
import CommandPalette from "./CommandPalette";
import { DEFAULT_FONT_SIZE } from "@/features/editor/cm-theme";

// frontend.plan.md §5.3 — iki başarısız deneme sonrası manuel moda geç
const MANUAL_MODE_THRESHOLD = 2;

const LINE_ENDINGS: Record<LineEnding, string> = {
  none: "",
  lf: "\n",
  cr: "\r",
  crlf: "\r\n",
};

// "?project=" ile açılan bir proje varsa onun kendi yükleme yolu (bkz.
// handleActivateProject) taslağı zaten uygulayacak — burada yalnızca hiç
// proje aktive edilmemiş ("unsaved") durumun ilk render'dan itibaren doğru
// başlaması için, useState lazy initializer içinde bir kez okunur.
function initialUnsavedDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  if (new URLSearchParams(window.location.search).get("project")) return null;
  return loadDraft(null);
}

export default function IdeShell() {
  const support = checkSerialSupport();
  const { state, chipInfo, error, connecting, connect, setChipInfo, setError } =
    useSerialStore();
  const build = useBuildStore();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loadProject, getVersion, projects, refresh: refreshProjects } = useProjects();
  const { install: installLibrary } = useLibraries();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [pendingGithubInstall, setPendingGithubInstall] = useState<PendingGithubInstall | null>(
    null,
  );

  const [fqbn, setFqbn] = useState(() => initialUnsavedDraft()?.fqbn ?? BOARDS[0].fqbn);
  const [boardOptions, setBoardOptions] = useState<Record<string, string>>(() =>
    defaultOptionValues(initialUnsavedDraft()?.fqbn ?? BOARDS[0].fqbn),
  );
  const [sidePanel, setSidePanel] = useState<SidePanel | null>("files");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState("monitor");
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);

  // Editör ayarları — EditorSettingsPanel'den okunur/yazılır, Editor.tsx'e
  // CodeMirror Compartment'ları üzerinden akar. Kalıcı değil (sayfa
  // yenilenince sıfırlanır) — bu turun kapsamı yalnızca canlı çalışması.
  const [editorFontSize, setEditorFontSize] = useState(DEFAULT_FONT_SIZE);
  const [editorLineWrap, setEditorLineWrap] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [boardHintDismissed, setBoardHintDismissed] = useState(false);

  // frontend.plan.md §3.2 — çoklu dosya sketch modeli
  const [files, setFiles] = useState<SketchFile[]>(() => initialUnsavedDraft()?.files ?? createDefaultSketch());
  const [openPaths, setOpenPaths] = useState<string[]>([PRIMARY_FILE]);
  const [activePath, setActivePath] = useState(PRIMARY_FILE);
  // Kütüphane desteği — files/fqbn ile aynı yaşam döngüsü: proje aktive
  // edilince/versiyon geri yüklenince birlikte değişir, sketch.yaml'a gömülü
  // olarak kalıcılaşır (bkz. api/src/projects/storage/sketch-yaml.ts).
  const [libraries, setLibraries] = useState<LibraryDep[]>(() => initialUnsavedDraft()?.libraries ?? []);
  // Commit'lenmemiş yerel taslak: son sunucudan/versiyon geçmişinden bilinen
  // hâl (autoCommit/commit sonrası veya proje yüklendiğinde) burada tutulur —
  // files/fqbn/libraries bundan sapınca ActivityBar'da nokta gösterilir.
  const lastSyncedRef = useRef<Draft | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [syncFailCount, setSyncFailCount] = useState(0);

  const [baud, setBaud] = useState(115200);
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [sendValue, setSendValue] = useState("");
  const [sendHistory, setSendHistory] = useState<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);

  const terminalRef = useRef<TerminalHandle>(null);
  const plotterRef = useRef<PlotterHandle>(null);
  const pendingLineRef = useRef("");

  // WorkspacePanel'in "VERSİYON GEÇMİŞİ" bölümü storageProvider'a göre hash/vN
  // biçimini seçiyor — ProjectsPanel'den bağımsız kendi useProjects() örneği
  // (Dashboard.tsx'teki gibi, bu kod tabanında yerleşik desen).
  useEffect(() => {
    if (auth.user) void refreshProjects();
  }, [auth.user, refreshProjects]);
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const isMonitoring = state === "monitoring";
  const isConnected = state !== "disconnected";
  // files boşsa (normalde olmamalı — handleActivateProject bunu engelliyor)
  // activeFile.content okuması IDE'yi çökertmesin diye boş bir dosyaya düşülür.
  const activeFile = files.find((f) => f.path === activePath) ?? files[0] ?? { path: PRIMARY_FILE, content: "" };

  // Her değişiklikte localStorage'a aynala (bkz. local-draft.ts) — sayfa
  // yenilenince/kapatılıp açılınca commit edilmemiş kod kaybolmasın. Aynı
  // geçişte lastSyncedRef'e göre "kaydedilmemiş değişiklik var mı" da
  // hesaplanır (ActivityBar'daki nokta göstergesi).
  useEffect(() => {
    const current: Draft = { files, fqbn, libraries };
    saveDraft(activeProjectId, current);
    const baseline = lastSyncedRef.current;
    setHasUnsavedChanges(activeProjectId !== null && baseline !== null && !draftsEqual(current, baseline));
  }, [files, fqbn, libraries, activeProjectId]);

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
        handleActivateProject(projectId, detail.files, detail.fqbn, detail.libraries);
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

  // design_handoff Etkileşim — "⌘K: her yerde kart seçiciyi açar". Genel
  // komut paletinin eski ⌘K bağı ⌘⇧K'ya taşındı (VSCode'un "command
  // palette" alışkanlığına yakın), TopBar'daki ⌘K rozeti artık yalnızca
  // kart seçiciyi işaret ediyor. Tarayıcının kendi kısayollarıyla çakışmasın
  // diye her iki kombinasyon da preventDefault ediliyor.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (e.shiftKey) {
        setCommandPaletteOpen((v) => !v);
      } else {
        setBoardDialogOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  // Arduino IDE'nin "Sketch > Include Library" davranışı — kütüphane
  // eklenince sketch.ino'nun başına #include satırı yazılır (zaten varsa
  // tekrar eklenmez). Kaldırma satırı geri almıyor — Arduino IDE de almıyor.
  async function handleAddLibrary(name: string, version: string) {
    const resolved = await installLibrary(name, version);
    setLibraries((prev) => [...prev.filter((l) => l.name !== name), { name, version }]);

    const header = resolved.find((r) => r.name === name)?.includes[0];
    if (!header) return;
    const line = `#include <${header}>`;
    setFiles((prev) => {
      const primary = prev.find((f) => f.path === PRIMARY_FILE);
      if (!primary || primary.content.includes(line)) return prev;
      return updateFileContent(prev, PRIMARY_FILE, `${line}\n${primary.content}`);
    });
  }

  function handleRemoveLibrary(name: string) {
    setLibraries((prev) => prev.filter((l) => l.name !== name));
  }

  function handleSelectPanel(panel: SidePanel) {
    setSidePanel((prev) => (prev === panel ? null : panel));
  }

  // ProjectsPanel.tsx'teki handleRestore ile aynı yol — WorkspacePanel'in
  // hızlı-bakış versiyon listesinden de aynı geri yükleme çalışsın diye.
  // discardDraft: true — kullanıcı bilerek eski bir versiyona dönüyor,
  // o proje için bekleyen yerel taslak varsa üzerine yazmadan atılır.
  async function handleRestoreVersion(versionId: string) {
    if (!activeProjectId) return;
    const version = await getVersion(activeProjectId, versionId);
    handleActivateProject(version.projectId, version.files, version.fqbn ?? undefined, version.libraries, {
      discardDraft: true,
    });
  }

  // master.plan.md §6 — proje oluşturma/yükleme/versiyon geri yükleme, hepsi
  // aynı yoldan geçer: editör içeriğini değiştirir + hangi projenin aktif
  // olduğunu işaretler (sonraki "Derle ve Yükle" o projeye versiyon yazar).
  // Bu proje için commit edilmemiş yerel bir taslak varsa (local-draft.ts),
  // sunucudan gelen (son commit'lenmiş) hâlin üzerine uygulanır — refresh'te
  // kaybolan kod sorununun çözümü. discardDraft:true bunu atlar (bkz. yukarı).
  function handleActivateProject(
    id: string | null,
    newFiles?: SketchFile[],
    newFqbn?: string,
    newLibraries?: LibraryDep[],
    opts?: { discardDraft?: boolean },
  ) {
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
      const baseline: Draft = { files: newFiles, fqbn: newFqbn ?? fqbn, libraries: newLibraries ?? [] };
      lastSyncedRef.current = baseline;
      if (opts?.discardDraft) clearDraft(id);
      const draft = opts?.discardDraft ? null : loadDraft(id);
      const effective = draft ?? baseline;

      setFiles(effective.files);
      setLibraries(effective.libraries);
      setFqbn(effective.fqbn);
      setBoardOptions(defaultOptionValues(effective.fqbn));
      if (draft) {
        toast.info("Kaydedilmemiş değişiklikler geri yüklendi", {
          description: "Bu proje için commit edilmemiş yerel bir taslak bulundu.",
        });
      }
      const stillOpen = effective.files.some((f) => f.path === activePath);
      setOpenPaths(stillOpen ? [activePath] : [PRIMARY_FILE]);
      setActivePath(stillOpen ? activePath : PRIMARY_FILE);
    } else if (newFqbn) {
      setFqbn(newFqbn);
      setBoardOptions(defaultOptionValues(newFqbn));
    }
  }

  // Yalnızca derle (Arduino IDE'nin "Verify" karşılığı) — kartı yazmaz,
  // sadece hataları/uyarıları editöre iliştirir. Toast/bildirim artık
  // useBuildStore içinde — Dashboard'a geçilse bile çalışmaya devam eder ve
  // sonucu her sayfada bildirir (bkz. useBuildStore.ts). .catch(() => {})
  // yalnızca zaten toast'lanmış hatanın "unhandled rejection" olarak
  // konsola düşmesini engelliyor.
  async function handleCompile() {
    setTerminalOpen(true);
    setBottomTab("build");
    await build.compile(files, fqbn, boardOptions, libraries).catch(() => {});
  }

  // frontend.plan.md §8 — Faz 5: derle (POST /api/compile + SSE) → merged.bin'i
  // 0x0'a yaz. Orkestrasyon (monitör devri, flash, hata/başarı toast'ı)
  // useBuildStore.compileAndFlash içinde — sayfadan ayrılınca durmaz.
  async function handleCompileAndFlash() {
    setTerminalOpen(true);
    setBottomTab("build");
    // §6 "Flash sonrası versiyon kaydı" — yalnızca girişliyken ve aktif proje
    // varken; "Derle" (yalnızca doğrula) bu satırı hiç göndermiyor.
    const projectId = auth.user && activeProjectId ? activeProjectId : undefined;
    await build.compileAndFlash(files, fqbn, boardOptions, libraries, projectId, baud);
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
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndexRef.current === null) return;
      const idx = historyIndexRef.current + 1;
      if (idx >= sendHistory.length) {
        // en sona geldi — boş girişe dön (terminallerin çoğunun davranışı)
        historyIndexRef.current = null;
        setSendValue("");
        return;
      }
      historyIndexRef.current = idx;
      setSendValue(sendHistory[idx]);
    }
  }

  // Girişsizken yönlendirme (yukarıdaki effect) tetiklenene kadar çıplak
  // beyaz ekran yerine kabukla aynı zeminde sessiz bir iskelet gösterilir.
  if (auth.loading || !auth.user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--vsc-activitybar)]">
        <span className="animate-pulse [font-family:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--vsc-fg-muted)]">
          espcode
        </span>
      </div>
    );
  }

  if (!support.ok) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--vsc-activitybar)] p-8">
        <div className="max-w-md rounded-[6px] border border-[var(--vsc-border)] bg-[var(--vsc-sidebar)] px-4 py-3 text-sm text-[var(--vsc-fg-muted)]">
          {support.reason === "no_api"
            ? "Bu tarayıcı karta yazmayı desteklemiyor. Chrome, Edge veya Firefox 151+ kullan — ya da .bin dosyasını indirip kendi aracınla yaz."
            : "Karta yazmak için güvenli bağlantı gerekiyor. Adresi https:// ile aç."}
        </div>
      </div>
    );
  }

  return (
    // "dark" sınıfı burada uygulama-geneli tema tercihinden bağımsız —
    // editör kabuğu (--vsc-*) sabit koyu (bkz. globals.css), içindeki
    // shadcn bileşenleri (Select, Dialog, Command, Switch, Popover) da
    // "datasheet" paletini her zaman koyu değerleriyle okusun diye kilitli.
    // Kullanıcı AccountMenu'den "Açık" seçse bile editör alanı değişmez.
    <div className="dark flex h-dvh flex-col">
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
        flashing={build.flashing}
        onCompile={handleCompile}
        onCompileAndFlash={handleCompileAndFlash}
      />

      {/* Kart hiç bağlanmadıysa engelleyici olmayan, kapatılabilir bir
          ipucu — önceden bu durum tamamen görünmezdi (yalnızca disabled
          butonlar). */}
      {!isConnected && !boardHintDismissed && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--vsc-border)] bg-[var(--vsc-selected)]/50 px-4 py-1.5 text-xs text-[var(--vsc-fg-muted)]">
          <InfoIcon size={13} strokeWidth={2.25} className="shrink-0" />
          <span className="flex-1">
            Karta bağlanmak için üstteki &quot;Kart seçiniz&quot;e tıkla.
          </span>
          <button
            onClick={() => setBoardHintDismissed(true)}
            title="Kapat"
            className="shrink-0 rounded p-0.5 text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
          >
            <XIcon size={13} strokeWidth={2.25} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ActivityBar
          active={sidePanel}
          onSelect={handleSelectPanel}
          onGoDashboard={() => router.push("/")}
          user={auth.user}
          onLogin={auth.login}
          onLogout={auth.logout}
          dirty={hasUnsavedChanges}
        />

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          {sidePanel && (
            <>
              <ResizablePanel defaultSize="18" minSize="14" maxSize="30">
                {sidePanel === "files" && (
                  <WorkspacePanel
                    files={files}
                    activePath={activePath}
                    onOpenFile={handleOpenFile}
                    onAddFile={handleAddFile}
                    onRemoveFile={handleRemoveFile}
                    activeProjectId={activeProjectId}
                    storageProvider={activeProject?.storageProvider ?? null}
                    onRestoreVersion={(id) => void handleRestoreVersion(id)}
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
                    libraries={libraries}
                    activeProjectId={activeProjectId}
                    onActivate={handleActivateProject}
                    onSaved={(id, savedFiles, savedFqbn, savedLibraries) => {
                      lastSyncedRef.current = { files: savedFiles, fqbn: savedFqbn, libraries: savedLibraries };
                      clearDraft(id);
                      setHasUnsavedChanges(false);
                    }}
                    pendingGithubInstall={pendingGithubInstall}
                    onConsumePendingGithubInstall={() => setPendingGithubInstall(null)}
                  />
                )}
                {sidePanel === "libraries" && (
                  <LibrariesPanel libraries={libraries} onAdd={handleAddLibrary} onRemove={handleRemoveLibrary} />
                )}
                {sidePanel === "settings" && (
                  <SettingsPanel
                    fqbn={fqbn}
                    connected={isConnected}
                    chipInfo={chipInfo}
                    boardOptions={boardOptions}
                    onOptionChange={handleOptionChange}
                    onOpenBoardPicker={() => setBoardDialogOpen(true)}
                  />
                )}
                {sidePanel === "editor" && (
                  <EditorSettingsPanel
                    fontSize={editorFontSize}
                    onFontSizeChange={setEditorFontSize}
                    lineWrap={editorLineWrap}
                    onLineWrapChange={setEditorLineWrap}
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
                      fontSize={editorFontSize}
                      lineWrap={editorLineWrap}
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
                      canMonitor={isConnected && !build.flashing}
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
        flashProgress={build.progress}
        flashStageLabel={build.flashStage ? FLASH_STAGE_LABEL[build.flashStage] : null}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        isConnected={isConnected}
        busy={build.status === "compiling" || build.flashing}
        isMonitoring={isMonitoring}
        files={files}
        activePath={activePath}
        onCompile={handleCompile}
        onCompileAndFlash={handleCompileAndFlash}
        onToggleMonitor={handleToggleMonitor}
        onPickBoard={() => setBoardDialogOpen(true)}
        onSelectPanel={setSidePanel}
        onOpenFile={handleOpenFile}
        onGoDashboard={() => router.push("/")}
      />
    </div>
  );
}
