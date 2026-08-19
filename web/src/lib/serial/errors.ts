export type SerialErrorCode =
  | "no_api"
  | "insecure_context"
  | "no_ports"
  | "port_busy"
  | "sync_failed"
  | "write_failed"
  | "cancelled";

export class SerialError extends Error {
  constructor(public code: SerialErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SerialError";
  }
}

// frontend.plan.md §12 — kullanıcıya gösterilecek metinler
export const SERIAL_ERROR_MESSAGES: Record<SerialErrorCode, string> = {
  no_api:
    "Bu tarayıcı karta yazmayı desteklemiyor. Chrome, Edge veya Firefox 151+ kullan — ya da .bin dosyasını indirip kendi aracınla yaz.",
  insecure_context:
    "Karta yazmak için güvenli bağlantı gerekiyor. Adresi https:// ile aç.",
  no_ports:
    "Port listesi boş. Kartın sürücüsü kurulu mu (CP2102 / CH340) ve kablo veri kablosu mu?",
  port_busy:
    "Port başka bir program tarafından kullanılıyor. Arduino IDE veya seri monitör açıksa kapat.",
  sync_failed:
    "Kart bootloader'a geçmedi. BOOT'u basılı tut, EN'e bas, BOOT'u bırak, sonra tekrar dene.",
  write_failed:
    "Yazma yarıda kesildi. Hızı 460800'e düşürüp tekrar dene.",
  cancelled: "İşlem iptal edildi.",
};

export function describeSerialError(err: unknown): string {
  if (err instanceof SerialError) return SERIAL_ERROR_MESSAGES[err.code];
  if (err instanceof DOMException && err.name === "NotFoundError") {
    return SERIAL_ERROR_MESSAGES.no_ports;
  }
  if (err instanceof Error) return err.message;
  return "Beklenmeyen bir hata oluştu.";
}
