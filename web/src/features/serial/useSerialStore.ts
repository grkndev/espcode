import { create } from "zustand";
import { serialSession, type SerialSessionState } from "./SerialSession";
import { describeSerialError } from "@/lib/serial/errors";

export interface ChipInfo {
  description: string;
  features: string[];
  crystalFreqMHz: number;
  macAddress: string;
  flashSize: string;
}

interface SerialStore {
  state: SerialSessionState;
  chipInfo: ChipInfo | null;
  error: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  setChipInfo: (info: ChipInfo | null) => void;
  setError: (message: string | null) => void;
}

export const useSerialStore = create<SerialStore>((set) => {
  serialSession.subscribe((state) => set({ state }));

  return {
    state: serialSession.getState(),
    chipInfo: null,
    error: null,
    connecting: false,

    connect: async () => {
      set({ connecting: true, error: null });
      try {
        await serialSession.requestPort();
      } catch (err) {
        set({ error: describeSerialError(err) });
      } finally {
        set({ connecting: false });
      }
    },

    setChipInfo: (chipInfo) => set({ chipInfo }),
    setError: (error) => set({ error }),
  };
});
