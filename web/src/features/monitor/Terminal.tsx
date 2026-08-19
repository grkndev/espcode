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

// frontend.plan.md §11.2 — terminal her iki modda da koyu kalır, kod okuma
// yüzeyi sabit olmalı; sayfanın açık/koyu temasını takip etmez.
const XTERM_THEME = {
  background: "#0d1114",
  foreground: "#dce3e8",
  cursor: "#3d3bff",
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
    return () => {
      window.removeEventListener("resize", onResize);
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
      clear: () => termRef.current?.clear(),
    }),
    [],
  );

  return <div ref={containerRef} className="h-64 overflow-hidden rounded" />;
});

export default SerialTerminal;
