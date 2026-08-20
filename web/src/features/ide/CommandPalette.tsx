"use client";

import {
  CheckIcon,
  CpuIcon,
  FileCodeIcon,
  FilesIcon,
  FolderGit2Icon,
  HammerIcon,
  LayoutDashboardIcon,
  LibraryIcon,
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

const GROUP_HEADING_CLASS =
  "**:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:font-[family-name:var(--font-data)] **:[[cmdk-group-heading]]:text-[9.5px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-[0.12em]";
const ITEM_CLASS = "gap-2.5 rounded-[10px] px-3 py-2.5 text-sm data-selected:bg-[var(--vsc-selected)]";

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
// doğrudan çağırır, yeni bir iş mantığı içermez. ⌘K artık kart seçiciye ayrıldığı
// için (design_handoff Etkileşim) burası ⌘⇧K/Ctrl+Shift+K ile açılıyor.
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
      className="w-[520px] sm:max-w-[520px]"
    >
      <Command className="p-0">
        <CommandInput
          placeholder="Komut ara…"
          className="bg-transparent text-sm"
          endAddon={<kbd data-slot="kbd">Esc</kbd>}
        />
        <CommandList className="max-h-96 p-2">
          <CommandEmpty className="py-10 text-sm">Sonuç bulunamadı.</CommandEmpty>

          <CommandGroup heading="Eylemler" className={GROUP_HEADING_CLASS}>
            <CommandItem
              value="Derle"
              disabled={!isConnected || busy}
              onSelect={() => run(onCompile)}
              className={ITEM_CLASS}
            >
              <HammerIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Derle</span>
            </CommandItem>
            <CommandItem
              value="Derle ve Yükle"
              disabled={!isConnected || busy}
              onSelect={() => run(onCompileAndFlash)}
              className={ITEM_CLASS}
            >
              <RocketIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Derle ve Yükle</span>
            </CommandItem>
            <CommandItem
              value={isMonitoring ? "Monitörü Durdur" : "Monitörü Başlat"}
              disabled={!isConnected}
              onSelect={() => run(onToggleMonitor)}
              className={ITEM_CLASS}
            >
              {isMonitoring ? (
                <SquareIcon className="size-4 text-muted-foreground" />
              ) : (
                <PlayIcon className="size-4 text-muted-foreground" />
              )}
              <span className="flex-1">{isMonitoring ? "Monitörü Durdur" : "Monitörü Başlat"}</span>
            </CommandItem>
            <CommandItem value="Kart Seç" onSelect={() => run(onPickBoard)} className={ITEM_CLASS}>
              <CpuIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Kart Seç</span>
              <span className="font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-faint)]">⌘K</span>
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Paneller" className={GROUP_HEADING_CLASS}>
            <CommandItem
              value="Sketch dosyaları"
              onSelect={() => run(() => onSelectPanel("files"))}
              className={ITEM_CLASS}
            >
              <FilesIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Sketch dosyaları</span>
            </CommandItem>
            <CommandItem
              value="Git"
              onSelect={() => run(() => onSelectPanel("projects"))}
              className={ITEM_CLASS}
            >
              <FolderGit2Icon className="size-4 text-muted-foreground" />
              <span className="flex-1">Git</span>
            </CommandItem>
            <CommandItem
              value="Kütüphaneler"
              onSelect={() => run(() => onSelectPanel("libraries"))}
              className={ITEM_CLASS}
            >
              <LibraryIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Kütüphaneler</span>
            </CommandItem>
            <CommandItem
              value="Kart ayarları"
              onSelect={() => run(() => onSelectPanel("settings"))}
              className={ITEM_CLASS}
            >
              <SettingsIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Kart ayarları</span>
            </CommandItem>
            <CommandItem
              value="Editör ayarları"
              onSelect={() => run(() => onSelectPanel("editor"))}
              className={ITEM_CLASS}
            >
              <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Editör ayarları</span>
            </CommandItem>
            <CommandItem value="Panoya dön" onSelect={() => run(onGoDashboard)} className={ITEM_CLASS}>
              <LayoutDashboardIcon className="size-4 text-muted-foreground" />
              <span className="flex-1">Panoya dön</span>
            </CommandItem>
          </CommandGroup>

          {files.length > 0 && (
            <CommandGroup heading="Dosyalar" className={GROUP_HEADING_CLASS}>
              {files.map((f) => (
                <CommandItem
                  key={f.path}
                  value={f.path}
                  onSelect={() => run(() => onOpenFile(f.path))}
                  className={ITEM_CLASS}
                >
                  <FileCodeIcon className="size-4 text-muted-foreground" />
                  <span className="flex-1">{f.path}</span>
                  {f.path === activePath && <CheckIcon className="size-4 text-[var(--vsc-accent-mono)]" />}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
