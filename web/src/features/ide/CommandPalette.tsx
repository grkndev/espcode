"use client";

import {
  CheckIcon,
  CpuIcon,
  FileCodeIcon,
  FilesIcon,
  FolderGit2Icon,
  HammerIcon,
  LayoutDashboardIcon,
  PlayIcon,
  RocketIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SquareIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SidePanel } from "./ActivityBar";
import type { SketchFile } from "@/features/editor/sketch-files";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isConnected: boolean;
  busy: boolean;
  isMonitoring: boolean;
  files: SketchFile[];
  activePath: string;
  onCompile: () => void;
  onCompileAndFlash: () => void;
  onToggleMonitor: () => void;
  onPickBoard: () => void;
  onSelectPanel: (panel: SidePanel) => void;
  onOpenFile: (path: string) => void;
  onGoDashboard: () => void;
}

// BoardPickerDialog.tsx ile aynı CommandDialog deseni — var olan handler'ları
// doğrudan çağırır, yeni bir iş mantığı içermez. IdeShell'de ⌘K/Ctrl+K ile açılır.
export default function CommandPalette({
  open,
  onOpenChange,
  isConnected,
  busy,
  isMonitoring,
  files,
  activePath,
  onCompile,
  onCompileAndFlash,
  onToggleMonitor,
  onPickBoard,
  onSelectPanel,
  onOpenFile,
  onGoDashboard,
}: CommandPaletteProps) {
  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Komut Paleti"
      description="Bir eylem ara"
      className="sm:max-w-2xl"
    >
      <Command className="p-2">
        <CommandInput
          placeholder="Komut ara…"
          className="text-xl bg-transparent"
          endAddon={<kbd data-slot="kbd">Esc</kbd>}
        />
        <CommandList className="max-h-96 p-2">
          <CommandEmpty className="py-10 text-base">Sonuç bulunamadı.</CommandEmpty>

          <CommandGroup
            heading="Eylemler"
            className="**:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:py-3 **:[[cmdk-group-heading]]:text-sm"
          >
            <CommandItem
              value="Derle"
              disabled={!isConnected || busy}
              onSelect={() => run(onCompile)}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <HammerIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">Derle</span>
            </CommandItem>
            <CommandItem
              value="Derle ve Yükle"
              disabled={!isConnected || busy}
              onSelect={() => run(onCompileAndFlash)}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <RocketIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">Derle ve Yükle</span>
            </CommandItem>
            <CommandItem
              value={isMonitoring ? "Monitörü Durdur" : "Monitörü Başlat"}
              disabled={!isConnected}
              onSelect={() => run(onToggleMonitor)}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              {isMonitoring ? (
                <SquareIcon className="size-5 text-muted-foreground" />
              ) : (
                <PlayIcon className="size-5 text-muted-foreground" />
              )}
              <span className="flex-1">{isMonitoring ? "Monitörü Durdur" : "Monitörü Başlat"}</span>
            </CommandItem>
            <CommandItem
              value="Kart Seç"
              onSelect={() => run(onPickBoard)}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <CpuIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">Kart Seç</span>
            </CommandItem>
          </CommandGroup>

          <CommandGroup
            heading="Paneller"
            className="**:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:py-3 **:[[cmdk-group-heading]]:text-sm"
          >
            <CommandItem
              value="Sketch dosyaları"
              onSelect={() => run(() => onSelectPanel("library"))}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <FilesIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">Sketch dosyaları</span>
            </CommandItem>
            <CommandItem
              value="Projelerim"
              onSelect={() => run(() => onSelectPanel("projects"))}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <FolderGit2Icon className="size-5 text-muted-foreground" />
              <span className="flex-1">Projelerim</span>
            </CommandItem>
            <CommandItem
              value="Kart ayarları"
              onSelect={() => run(() => onSelectPanel("settings"))}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <SettingsIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">Kart ayarları</span>
            </CommandItem>
            <CommandItem
              value="Editör ayarları"
              onSelect={() => run(() => onSelectPanel("editor"))}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <SlidersHorizontalIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">Editör ayarları</span>
            </CommandItem>
            <CommandItem
              value="Panoya dön"
              onSelect={() => run(onGoDashboard)}
              className="gap-3 rounded-xl px-4 py-3.5 text-base"
            >
              <LayoutDashboardIcon className="size-5 text-muted-foreground" />
              <span className="flex-1">Panoya dön</span>
            </CommandItem>
          </CommandGroup>

          {files.length > 0 && (
            <CommandGroup
              heading="Dosyalar"
              className="**:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:py-3 **:[[cmdk-group-heading]]:text-sm"
            >
              {files.map((f) => (
                <CommandItem
                  key={f.path}
                  value={f.path}
                  onSelect={() => run(() => onOpenFile(f.path))}
                  className="gap-3 rounded-xl px-4 py-3.5 text-base"
                >
                  <FileCodeIcon className="size-5 text-muted-foreground" />
                  <span className="flex-1">{f.path}</span>
                  {f.path === activePath && <CheckIcon className="size-5 text-[var(--vsc-accent)]" />}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
