"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommitResult } from "./useProjects";

export interface CommitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (message: string, force: boolean) => Promise<CommitResult>;
  /** Toast metninde nereye kaydedildiğini açıkça söylemek için — bağlama
   * sessizce yarım kalırsa kullanıcı "commit gitti ama nereye?" diye
   * kalmasın. */
  provider: "postgres" | "github";
}

// Flash'tan bağımsız manuel kaydetme. GitHub'a bağlı projede sha çakışması
// (409) olursa "üzerine yazayım mı?" onayı isteniyor — master.plan.md §3.1
// "otomatik merge yok".
export default function CommitDialog({ open, onOpenChange, onCommit, provider }: CommitDialogProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [conflictPaths, setConflictPaths] = useState<string[] | null>(null);

  function reset() {
    setMessage("");
    setConflictPaths(null);
  }

  async function submit(force: boolean) {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const result = await onCommit(message.trim(), force);
      if (result.ok) {
        toast.success(provider === "github" ? "GitHub'a commit'lendi" : "Postgres'e kaydedildi");
        reset();
        onOpenChange(false);
        return;
      }
      if (result.reason === "conflict") {
        setConflictPaths(result.paths);
        return;
      }
      toast.error("GitHub bağlantısı koptu", {
        description: "Projeyi yeniden bağlaman gerekiyor.",
      });
      onOpenChange(false);
    } catch (err) {
      toast.error("Commit başarısız", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Değişiklikleri kaydet</DialogTitle>
          <DialogDescription>
            Flash beklemeden şimdiki hâli bir versiyon olarak kaydet.
          </DialogDescription>
        </DialogHeader>

        {conflictPaths ? (
          <>
            <p className="text-sm text-muted-foreground">
              Şu dosyalar GitHub&apos;da elden değişmiş:{" "}
              <strong className="text-foreground">{conflictPaths.join(", ")}</strong>. Üzerine
              yazayım mı?
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConflictPaths(null)} disabled={submitting}>
                Vazgeç
              </Button>
              <Button onClick={() => void submit(true)} disabled={submitting}>
                Üzerine yaz
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <Textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ne değişti?"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(false);
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Vazgeç
              </Button>
              <Button onClick={() => void submit(false)} disabled={submitting || !message.trim()}>
                Commit&apos;le
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
