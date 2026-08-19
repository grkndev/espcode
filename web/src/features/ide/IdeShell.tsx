"use client";

import { useEffect, useRef, useState } from "react";
import { checkSerialSupport } from "@/lib/serial/support";
import { serialSession } from "@/features/serial/SerialSession";
import { useSerialStore } from "@/features/serial/useSerialStore";
import { getChipInfo, flashFirmware } from "@/features/flash/flasher";
import { describeSerialError } from "@/lib/serial/errors";
import { type TerminalHandle } from "@/features/monitor/Terminal";
import { LineBuffer } from "@/features/monitor/line-buffer";
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

  const [fqbn, setFqbn] = useState(BOARDS[2].fqbn); // esp32:esp32:esp32s3
  const [sidePanel, setSidePanel] = useState<SidePanel | null>("library");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);

  // frontend.plan.md §3.2 — çoklu dosya sketch modeli
  const [files, setFiles] = useState<SketchFile[]>(createDefaultSketch);
  const [openPaths, setOpenPaths] = useState<string[]>([PRIMARY_FILE]);
  const [activePath, setActivePath] = useState(PRIMARY_FILE);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [syncFailCount, setSyncFailCount] = useState(0);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [address, setAddress] = useState("0x0");

  const [flashing, setFlashing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [flashDone, setFlashDone] = useState(false);

  const [baud, setBaud] = useState(115200);
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [sendValue, setSendValue] = useState("");
  const [sendHistory, setSendHistory] = useState<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const plotterRef = useRef<PlotterHandle>(null);
  const lineBufferRef = useRef(new LineBuffer());
  const pendingLineRef = useRef("");

  const isMonitoring = state === "monitoring";
  const isConnected = state !== "disconnected";
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const appendLog = (line: string) => setLogLines((prev) => [...prev.slice(-199), line]);

  // Kart bağlıyken gelen tüm seri veri buraya akar — startMonitor()
  // çağrılmadığı sürece SerialSession hiç okuma döngüsü başlatmaz. Terminal
  // ham parçayı olduğu gibi alır; plotter tam satır ister (§7.1).
  useEffect(() => {
    return serialSession.subscribeData((chunk) => {
      terminalRef.current?.write(chunk);
      lineBufferRef.current.push(chunk);

      pendingLineRef.current += chunk;
      const lines = pendingLineRef.current.split(/\r\n|\r|\n/);
      pendingLineRef.current = lines.pop() ?? "";
      for (const line of lines) plotterRef.current?.pushLine(line);
    });
  }, []);

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
      setSyncFailCount((n) => n + 1);
      setError(describeSerialError(err));
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
    setBoardDialogOpen(false);
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setFileName(file.name);
    setFileData(new Uint8Array(buffer));
  }

  async function handleFlash() {
    const port = serialSession.getPort();
    if (!port || !fileData) return;
    setError(null);
    setFlashDone(false);
    setFlashing(true);

    // frontend.plan.md §4.1 — monitör açıkken flash: devri kullanıcıya
    // göstermeden durdur → yaz → geri başlat.
    const wasMonitoring = isMonitoring;
    if (wasMonitoring) await serialSession.stopMonitor();
    serialSession.beginFlashing();

    try {
      const addr = Number.parseInt(address, 16);
      await flashFirmware(port, { data: fileData, address: addr }, setProgress, appendLog);
      setFlashDone(true);
    } catch (err) {
      setError(describeSerialError(err));
    } finally {
      setFlashing(false);
      setProgress(null);
      serialSession.endFlashing();
      if (wasMonitoring) await serialSession.startMonitor(baud).catch(() => {});
    }
  }

  async function handleToggleMonitor() {
    setError(null);
    try {
      if (isMonitoring) {
        await serialSession.stopMonitor();
      } else {
        terminalRef.current?.clear();
        lineBufferRef.current.clear();
        plotterRef.current?.clear();
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

  function exportBuffer(kind: "log" | "csv") {
    const text = kind === "log" ? lineBufferRef.current.toLog() : lineBufferRef.current.toCsv();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `espcode-monitor.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!support.ok) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Banner tone="warn">
          {support.reason === "no_api"
            ? "Bu tarayıcı karta yazmayı desteklemiyor. Chrome, Edge veya Firefox 151+ kullan — ya da .bin dosyasını indirip kendi aracınla yaz."
            : "Karta yazmak için güvenli bağlantı gerekiyor. Adresi https:// ile aç."}
        </Banner>
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
        flash={{
          connected: isConnected,
          fileName,
          onFile: handleFile,
          address,
          onAddressChange: setAddress,
          flashing,
          progress,
          flashDone,
          canFlash: isConnected && !!fileData,
          onFlash: handleFlash,
        }}
      />

      {(error || syncFailCount >= MANUAL_MODE_THRESHOLD) && (
        <div className="flex flex-col gap-1 border-b border-[var(--vsc-border)] bg-[var(--vsc-activitybar)] p-2">
          {error && <Banner tone="error">{error}</Banner>}
          {syncFailCount >= MANUAL_MODE_THRESHOLD && (
            <Banner tone="warn">
              Kart yanıt vermiyor. Kartın üzerindeki BOOT düğmesini basılı tut, EN (veya RST)
              düğmesine bir kez bas, sonra BOOT&apos;u bırak. Ardından tekrar bağlanmayı dene.
            </Banner>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ActivityBar active={sidePanel} onSelect={handleSelectPanel} />

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          {sidePanel && (
            <>
              <ResizablePanel defaultSize="18" minSize="14" maxSize="30">
                {sidePanel === "library" ? (
                  <FileTree
                    files={files}
                    activePath={activePath}
                    onOpen={handleOpenFile}
                    onAdd={handleAddFile}
                    onRemove={handleRemoveFile}
                  />
                ) : (
                  <SettingsPanel fqbn={fqbn} chipInfo={chipInfo} />
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
                    />
                  </div>
                </div>
              </ResizablePanel>

              {terminalOpen && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize="30" minSize="15">
                    <BottomPanel
                      terminalRef={terminalRef}
                      plotterRef={plotterRef}
                      isMonitoring={isMonitoring}
                      canMonitor={isConnected && !flashing}
                      baud={baud}
                      onBaudChange={handleBaudChange}
                      onToggleMonitor={handleToggleMonitor}
                      sendValue={sendValue}
                      onSendValueChange={setSendValue}
                      onSendKeyDown={handleSendKeyDown}
                      lineEnding={lineEnding}
                      onLineEndingChange={setLineEnding}
                      onSend={handleSend}
                      onExport={exportBuffer}
                      buildLog={logLines.join("")}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <StatusBar state={state} fqbn={fqbn} baud={baud} />
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "warn" | "error" | "ok";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-red-500 text-red-400"
      : tone === "ok"
        ? "border-[var(--vsc-accent)] text-[var(--vsc-accent)]"
        : "border-[var(--vsc-fg-muted)] text-[var(--vsc-fg-muted)]";
  return <div className={`rounded border px-4 py-3 text-sm ${toneClass}`}>{children}</div>;
}
