import { SerialError } from "@/lib/serial/errors";

export type SerialSessionState = "disconnected" | "granted" | "monitoring" | "flashing";

type Listener = (state: SerialSessionState, port: SerialPort | null) => void;
type DataListener = (chunk: string) => void;

/**
 * Seri port, paylaşılamayan bir donanım kaynağı — bu yüzden React ağacının
 * dışında yaşayan tek bir sınıfa ait (frontend.plan.md §3.1). Bileşenler bu
 * sınıfa Zustand store üzerinden abone olur, port'u doğrudan tutmaz.
 *
 * `monitoring` ve `flashing` aynı anda olamaz (§4.1) — flash başlamadan önce
 * çağıran taraf `stopMonitor()`'ı, bittikten sonra istiyorsa `startMonitor()`'ı
 * kendi çağırır; bu sınıf yalnızca portu kilitlemeyecek şekilde açıp kapatmayı
 * garanti eder.
 */
class SerialSession {
  private port: SerialPort | null = null;
  private state: SerialSessionState = "disconnected";
  private listeners = new Set<Listener>();
  private dataListeners = new Set<DataListener>();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor() {
    if (typeof navigator !== "undefined" && "serial" in navigator) {
      navigator.serial.addEventListener("disconnect", (e) => {
        const target = (e as Event & { target: SerialPort }).target;
        if (target === this.port) {
          this.reader = null;
          this.writer = null;
          this.port = null;
          this.setState("disconnected");
        }
      });
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeData(listener: DataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  private setState(state: SerialSessionState) {
    this.state = state;
    for (const l of this.listeners) l(this.state, this.port);
  }

  getPort(): SerialPort | null {
    return this.port;
  }

  getState(): SerialSessionState {
    return this.state;
  }

  async requestPort(): Promise<SerialPort> {
    try {
      const port = await navigator.serial.requestPort();
      this.port = port;
      this.setState("granted");
      return port;
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") {
        throw new SerialError("no_ports", "Kullanıcı port seçmedi veya liste boş.");
      }
      throw err;
    }
  }

  beginFlashing() {
    if (!this.port) throw new SerialError("no_ports", "Önce bir port bağlanmalı.");
    this.setState("flashing");
  }

  endFlashing() {
    this.setState(this.port ? "granted" : "disconnected");
  }

  // frontend.plan.md §6 — monitörü başlat. Port kapalıysa yeni baud ile açar.
  async startMonitor(baudRate: number): Promise<void> {
    if (!this.port) throw new SerialError("no_ports", "Önce bir port bağlanmalı.");
    if (this.state === "monitoring") return;
    await this.port.open({ baudRate });
    this.setState("monitoring");
    this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const port = this.port;
    if (!port?.readable) return;
    const decoder = new TextDecoder();
    // §4.2 — pipeThrough(TextDecoderStream) KULLANMA, port.readable'ı kalıcı
    // kilitler. Manuel decode: kilit kontrolü bizde kalır, cancel() anında eder.
    this.reader = port.readable.getReader();
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          const text = decoder.decode(value, { stream: true });
          for (const l of this.dataListeners) l(text);
        }
      }
    } catch {
      // Port okunamaz hale geldi (kablo çekildi vb.) — sessizce çık, disconnect
      // event handler'ı zaten durumu temizleyecek.
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
    }
  }

  async send(text: string): Promise<void> {
    if (!this.port?.writable) return;
    if (!this.writer) this.writer = this.port.writable.getWriter();
    await this.writer.write(new TextEncoder().encode(text));
  }

  // §4.2 — doğru kapatma sırası: reader cancel+release, writer close+release, en son port.
  async stopMonitor(): Promise<void> {
    if (this.state !== "monitoring") return;
    if (this.reader) {
      await this.reader.cancel().catch(() => {});
    }
    if (this.writer) {
      await this.writer.close().catch(() => {});
      this.writer.releaseLock();
      this.writer = null;
    }
    await this.port?.close().catch(() => {});
    this.setState(this.port ? "granted" : "disconnected");
  }
}

export const serialSession = new SerialSession();
