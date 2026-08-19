// frontend.plan.md §6.1 — xterm'in kendi scrollback'i UI sınırı çiziyor, dışa
// aktarma bu ring buffer üzerinden çalışır.
export class LineBuffer {
  private lines: { t: number; text: string }[] = [];

  constructor(private max = 5000) {}

  push(text: string, t = Date.now()) {
    this.lines.push({ t, text });
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
  }

  clear() {
    this.lines = [];
  }

  toLog(): string {
    return this.lines.map((l) => l.text).join("");
  }

  toCsv(): string {
    const header = "timestamp,text\n";
    const rows = this.lines.map(
      (l) => `${new Date(l.t).toISOString()},"${l.text.replace(/"/g, '""').trim()}"`,
    );
    return header + rows.join("\n");
  }
}
