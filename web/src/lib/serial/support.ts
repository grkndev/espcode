export type SerialSupport =
  | { ok: true }
  | { ok: false; reason: "insecure_context" | "no_api" };

export function checkSerialSupport(): SerialSupport {
  if (typeof window === "undefined") return { ok: false, reason: "no_api" };
  if (!window.isSecureContext) return { ok: false, reason: "insecure_context" };
  if (!("serial" in navigator)) return { ok: false, reason: "no_api" };
  return { ok: true };
}
