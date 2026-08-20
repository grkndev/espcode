"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

export interface TerminalHandle {
  write: (chunk: string) => void;
  clear: () => void;
}

// Panelin kendi koyu tonu — kabuğun geri kalanıyla aynı (canvas fillStyle
// CSS var() çözemediği için literal hex).
const XTERM_THEME = {
  background: "#09090b",
  foreground: "#d4d4d8",
  cursor: "#4a48ff",
};

const SerialTerminal = forwardRef<TerminalHandle>(function SerialTerminal(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  // §6.2 — kart saniyede yüzlerce satır basabilir, her satırda term.write()
  // çağırmak ana thread'i kilitler. Biriktir, rAF ile tek seferde yaz.
  const pendingRef = useRef("");
  const scheduledRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      convertEol: true,
      scrollback: 5000,
      fontFamily: "var(--font-code)",
      fontSize: 13,
      theme: XTERM_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    // ResizablePanel sürüklemesi window resize tetiklemez — konteynerin kendi
    // boyut değişimini izle, yoksa xterm eski satır/sütun sayısında donar ve
    // panel taştığında bütün kabuk (sekmeler dahil) kayar.
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(containerRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      write: (chunk: string) => {
        pendingRef.current += chunk;
        if (scheduledRef.current) return;
        scheduledRef.current = true;
        requestAnimationFrame(() => {
          termRef.current?.write(pendingRef.current);
          pendingRef.current = "";
          scheduledRef.current = false;
        });
      },
      clear: () => {
        // Temizlenirken hâlâ yazılmayı bekleyen (rAF'a kuyruğa alınmış) bir
        // parça olabilir — sıfırlamazsak ekran temizlenir temizlenmez o eski
        // veri geri yazılır, temizleme hiç olmamış gibi görünür.
        pendingRef.current = "";
        // term.clear() imleç satırını "yeni prompt satırı" olarak korur (gerçek
        // shell davranışını taklit eder) — bizde prompt yok, o satır hep geride
        // kalan tek mesaj gibi görünüyordu. reset() (RIS) hiçbir şey bırakmaz.
        termRef.current?.reset();
      },
    }),
    [],
  );

  return <div ref={containerRef} className="h-full w-full overflow-hidden rounded" />;
});

export default SerialTerminal;
