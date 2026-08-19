import { SerialError } from "@/lib/serial/errors";

export type SerialSessionState = "disconnected" | "granted" | "flashing";

type Listener = (state: SerialSessionState, port: SerialPort | null) => void;

/**
 * Seri port, paylaşılamayan bir donanım kaynağı — bu yüzden React ağacının
 * dışında yaşayan tek bir sınıfa ait (frontend.plan.md §3.1). Bileşenler bu
 * sınıfa Zustand store üzerinden abone olur, port'u doğrudan tutmaz.
 */
class SerialSession {
  private port: SerialPort | null = null;
  private state: SerialSessionState = "disconnected";
  private listeners = new Set<Listener>();

  constructor() {
    if (typeof navigator !== "undefined" && "serial" in navigator) {
      navigator.serial.addEventListener("disconnect", (e) => {
        const target = (e as Event & { target: SerialPort }).target;
        if (target === this.port) {
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
}

export const serialSession = new SerialSession();
