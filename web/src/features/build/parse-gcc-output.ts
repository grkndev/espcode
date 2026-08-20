// frontend.plan.md §8.3 — ham gcc çıktısını satıra iliştirilebilir hale getir.
export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
}

// Pozisyonel gruplar (tsconfig target'ı isimli grup gerektiren ES2018'in
// altında): 1=file, 2=line, 3=col, 4=severity, 5=message
const GCC_LINE = /^([^:\n]+):(\d+):(\d+):\s+(error|warning|note):\s+(.*)$/;

export function parseDiagnostics(output: string): Diagnostic[] {
  // ANSI renk kodlarını at (arduino-cli çıktısı --no-color olmadan renkli gelir)
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  return clean.split("\n").flatMap((l) => {
    const m = GCC_LINE.exec(l.trim());
    if (!m) return [];
    const [, file, line, col, sev, msg] = m;
    if (sev === "note") return [];
    return [
      {
        file: file.split("/").pop() ?? file,
        line: Number(line),
        col: Number(col),
        severity: sev === "error" ? ("error" as const) : ("warning" as const),
        message: msg,
      },
    ];
  });
}
