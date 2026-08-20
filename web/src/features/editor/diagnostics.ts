import type { EditorState } from "@codemirror/state";
import type { Diagnostic as CmDiagnostic } from "@codemirror/lint";
import type { Diagnostic } from "@/features/build/parse-gcc-output";

// frontend.plan.md §8.3 — gcc satır/sütun → CM6 doküman ofseti. Sunucu #line
// direktifi kullandığı için satır numarası .ino dosyasıyla birebir örtüşüyor,
// offset düzeltmesi gerekmiyor (VPS sözleşmesi, §15).
export function toCmDiagnostics(state: EditorState, diagnostics: Diagnostic[]): CmDiagnostic[] {
  const lastLine = state.doc.lines;
  return diagnostics.flatMap((d): CmDiagnostic[] => {
    if (d.line < 1 || d.line > lastLine) return [];
    const line = state.doc.line(d.line);
    const from = Math.min(line.from + Math.max(0, d.col - 1), line.to);
    return [{ from, to: line.to, severity: d.severity, message: d.message }];
  });
}
