"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { autocompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { cmTheme, cmSyntaxHighlight, fontSizeTheme, DEFAULT_FONT_SIZE } from "./cm-theme";
import arduinoCompletionSource from "./arduino-completions";
import { toCmDiagnostics } from "./diagnostics";
import type { Diagnostic } from "@/features/build/parse-gcc-output";

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics?: Diagnostic[];
  /** Editör ayarları panelinden gelir — Compartment ile canlı uygulanır. */
  fontSize?: number;
  lineWrap?: boolean;
}

export default function Editor({
  value,
  onChange,
  diagnostics,
  fontSize = DEFAULT_FONT_SIZE,
  lineWrap = false,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Hiçbiri Compartment'a alınmadan önce her ayar değişikliği tüm editörün
  // remount olmasını (undo geçmişinin/imlecin kaybolmasını) gerektiriyordu —
  // yazı tipi boyutu ve satır kaydırma artık kendi Compartment'larında.
  const [fontSizeCompartment] = useState(() => new Compartment());
  const [lineWrapCompartment] = useState(() => new Compartment());

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        cpp(),
        cmTheme,
        fontSizeCompartment.of(fontSizeTheme(fontSize)),
        lineWrapCompartment.of(lineWrap ? EditorView.lineWrapping : []),
        cmSyntaxHighlight,
        lintGutter(),
        // basicSetup'ın varsayılan autocompletion'ı üzerine yazıyor —
        // arduinoCompletionSource tek kaynak (§8.4).
        autocompletion({ override: [arduinoCompletionSource] }),
        keymap.of([indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: fontSizeCompartment.reconfigure(fontSizeTheme(fontSize)),
    });
  }, [fontSize, fontSizeCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineWrapCompartment.reconfigure(lineWrap ? EditorView.lineWrapping : []),
    });
  }, [lineWrap, lineWrapCompartment]);

  // Dışarıdan değer değişirse (ör. versiyon geri yükleme) editörü senkronla —
  // kendi onChange'inden gelen döngüyü önlemek için doc karşılaştırması yapılır.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  // frontend.plan.md §8.3 — derleme sonucu geldikçe hata/uyarıları satıra iliştir.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(setDiagnostics(view.state, toCmDiagnostics(view.state, diagnostics ?? [])));
  }, [diagnostics]);

  return <div ref={containerRef} className="h-full w-full overflow-auto" />;
}
