"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GitBranch, Lock, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  useGithubStorage,
  type GithubInstallationSummary,
  type GithubRepoSummary,
} from "./useGithubStorage";

export interface GithubLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** ?github=installed dönüşünde kurulum zaten hazır — doğrudan repo adımına geç. */
  preselectInstallationId?: string | null;
  onLinked: () => void;
}

// master.plan.md §3.1 adım 5-6 — kurulum seç (veya App'i kur) → repo seç → bağla.
// Yeni repo açma yok: yalnızca App'in izin verildiği repolar listelenir.
export default function GithubLinkDialog({
  open,
  onOpenChange,
  projectId,
  preselectInstallationId,
  onLinked,
}: GithubLinkDialogProps) {
  const { startInstall, installations, repos, link } = useGithubStorage();
  const [installList, setInstallList] = useState<GithubInstallationSummary[] | null>(null);
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [repoList, setRepoList] = useState<GithubRepoSummary[] | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dialog açılınca önceki listeyi temizler, sorgu kütüphanesi yok
    setRepoList(null);
    void installations().then((rows) => {
      setInstallList(rows);
      const preselected = preselectInstallationId ?? rows[0]?.id ?? null;
      setInstallationId(preselected);
    });
  }, [open, preselectInstallationId, installations]);

  useEffect(() => {
    if (!installationId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hesap değişince önceki repo listesini temizler, sorgu kütüphanesi yok
    setRepoList(null);
    void repos(installationId)
      .then(setRepoList)
      .catch(() => {
        toast.error("Depolar okunamadı");
        setRepoList([]);
      });
  }, [installationId, repos]);

  async function handleLink(repoFullName: string) {
    if (!installationId) return;
    setLinking(true);
    try {
      await link(projectId, installationId, repoFullName);
      toast.success("GitHub'a bağlandı", { description: repoFullName });
      onOpenChange(false);
      onLinked();
    } catch (err) {
      toast.error("Bağlanamadı", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLinking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="size-4" />
            GitHub&apos;a bağla
          </DialogTitle>
          <DialogDescription>
            Bu proje flash&apos;landıkça (ve elle) seçtiğin depoya commit&apos;lenir. Versiyon
            geçmişi artık GitHub&apos;ın commit geçmişi olur.
          </DialogDescription>
        </DialogHeader>

        {installList === null ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : installList.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz bir GitHub App kurulumun yok. Kurulumda hangi depolara izin vereceğini
              kendin seçersin.
            </p>
            <Button onClick={() => startInstall(projectId)}>
              <GitBranch /> GitHub&apos;da kur
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Select value={installationId ?? undefined} onValueChange={setInstallationId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Hesap seç" />
                </SelectTrigger>
                <SelectContent>
                  {installList.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.accountLogin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => startInstall(projectId)} title="Başka hesap ekle">
                <Plus />
              </Button>
            </div>

            <Command className="rounded-xl border border-border">
              <CommandInput placeholder="Depo ara…" />
              <CommandList className="max-h-64">
                <CommandEmpty className="py-8 text-sm">
                  {repoList === null ? "Yükleniyor…" : "Depo bulunamadı."}
                </CommandEmpty>
                <CommandGroup>
                  {(repoList ?? []).map((repo) => (
                    <CommandItem
                      key={repo.fullName}
                      value={repo.fullName}
                      disabled={linking}
                      onSelect={() => void handleLink(repo.fullName)}
                      className="gap-2"
                    >
                      {repo.private && <Lock className="size-3.5 text-muted-foreground" />}
                      <span className="flex-1 truncate">{repo.fullName}</span>
                      <span className="text-xs text-muted-foreground">{repo.defaultBranch}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
