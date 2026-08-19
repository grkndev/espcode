export interface Sample {
  channel: string;
  value: number;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const LABELED_TOKEN = /^([A-Za-z_][\w]*):(-?\d+(?:\.\d+)?)$/;

// frontend.plan.md §7.1 — iki format destekleniyor, formata uymayan satırlar
// sessizce atlanıyor (plotter açıkken normal log satırları grafiği bozmamalı).
export function parseSampleLine(line: string): Sample[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Etiketli — tercih edilen: "temp:12.4 hum:55 vcc:3.3"
  const tokens = trimmed.split(/\s+/);
  const labeled = tokens.map((t) => LABELED_TOKEN.exec(t));
  if (labeled.every((m) => m !== null)) {
    return labeled.map((m) => ({ channel: m![1], value: Number(m![2]) }));
  }

  // Etiketsiz CSV: "12.4,55,3.3"
  const csvParts = trimmed.split(",").map((p) => p.trim());
  if (csvParts.every((p) => NUMBER.test(p))) {
    return csvParts.map((v, i) => ({ channel: `ch${i}`, value: Number(v) }));
  }

  return [];
}
