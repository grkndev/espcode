// Arduino Tools menüsündeki kart bazlı derleme seçenekleri (boards.txt'ten
// gelir). Değerler arduino-esp32 core'un genel yapısına göre yaklaşık —
// backend gerçek derlemeyi kurunca (Faz 5) kurulu core sürümünün (§8 Adım 4
// — esp32:esp32@3.3.11) gerçek boards.txt'iyle doğrulanmalı. Şimdilik yalnızca
// UI + state; hiçbir derleme çağrısına bağlı değil.
export interface BoardOptionChoice {
  value: string;
  label: string;
}

export type BoardOptionGroup = "Bellek" | "Performans" | "USB" | "Yükleme" | "Kablosuz";

export interface BoardOption {
  key: string;
  label: string;
  group: BoardOptionGroup;
  default: string;
  choices: BoardOptionChoice[];
}

interface BoardCapabilities {
  dualCore: boolean; // C3/C6 tek çekirdekli RISC-V, S3/klasik ESP32 çift çekirdekli
  nativeUsb: boolean; // klasik ESP32'de yok, S3/C3/C6'da USB-Serial-JTAG var
  psram: boolean; // yalnızca yaygın PSRAM'lı modül S3 için varsayılan açık
  zigbee: boolean; // yalnızca 802.15.4 radyosu olan C6
}

const CAPS: Record<string, BoardCapabilities> = {
  "esp32:esp32:esp32": { dualCore: true, nativeUsb: false, psram: false, zigbee: false },
  "esp32:esp32:esp32s3": { dualCore: true, nativeUsb: true, psram: true, zigbee: false },
  "esp32:esp32:esp32c3": { dualCore: false, nativeUsb: true, psram: false, zigbee: false },
  "esp32:esp32:esp32c6": { dualCore: false, nativeUsb: true, psram: false, zigbee: true },
};

export function getBoardOptions(fqbn: string): BoardOption[] {
  const caps = CAPS[fqbn] ?? CAPS["esp32:esp32:esp32s3"];

  const opts: BoardOption[] = [
    {
      key: "CPUFreq",
      label: "CPU Frekansı",
      group: "Performans",
      default: caps.dualCore ? "240" : "160",
      choices: caps.dualCore
        ? [
            { value: "240", label: "240MHz" },
            { value: "160", label: "160MHz" },
            { value: "80", label: "80MHz" },
          ]
        : [
            { value: "160", label: "160MHz" },
            { value: "80", label: "80MHz" },
          ],
    },
    {
      key: "FlashMode",
      label: "Flash Modu",
      group: "Bellek",
      default: "qio",
      choices: [
        { value: "qio", label: "QIO" },
        { value: "dio", label: "DIO" },
        { value: "qout", label: "QOUT" },
        { value: "dout", label: "DOUT" },
      ],
    },
    {
      key: "FlashSize",
      label: "Flash Boyutu",
      group: "Bellek",
      default: "4M",
      choices: [
        { value: "4M", label: "4MB" },
        { value: "8M", label: "8MB" },
        { value: "16M", label: "16MB" },
      ],
    },
    {
      key: "PartitionScheme",
      label: "Partition Şeması",
      group: "Bellek",
      default: "default",
      choices: [
        { value: "default", label: "Default 4MB (1.2MB APP/1.5MB SPIFFS)" },
        { value: "minimal", label: "Minimal SPIFFS (1.9MB APP/190KB SPIFFS)" },
        { value: "no_ota", label: "No OTA (2MB APP/2MB SPIFFS)" },
        { value: "huge_app", label: "Huge APP (3MB No OTA/1MB SPIFFS)" },
      ],
    },
    {
      key: "DebugLevel",
      label: "Debug Seviyesi",
      group: "Yükleme",
      default: "none",
      choices: ["none", "error", "warn", "info", "debug", "verbose"].map((v) => ({
        value: v,
        label: v[0].toUpperCase() + v.slice(1),
      })),
    },
    {
      key: "EraseFlash",
      label: "Yüklemeden Önce Flash'ı Sil",
      group: "Yükleme",
      default: "none",
      choices: [
        { value: "none", label: "Disabled" },
        { value: "all", label: "Enabled" },
      ],
    },
    {
      key: "UploadSpeed",
      label: "Yükleme Hızı",
      group: "Yükleme",
      default: "921600",
      choices: ["115200", "230400", "460800", "921600"].map((v) => ({ value: v, label: v })),
    },
  ];

  if (caps.dualCore) {
    opts.push(
      {
        key: "LoopCore",
        label: "Arduino Çalışma Çekirdeği",
        group: "Performans",
        default: "1",
        choices: [
          { value: "1", label: "Core 1" },
          { value: "0", label: "Core 0" },
        ],
      },
      {
        key: "EventsCore",
        label: "Events Çekirdeği",
        group: "Performans",
        default: "1",
        choices: [
          { value: "1", label: "Core 1" },
          { value: "0", label: "Core 0" },
        ],
      },
    );
  }

  if (caps.nativeUsb) {
    opts.push(
      {
        key: "CDCOnBoot",
        label: "USB CDC (Açılışta)",
        group: "USB",
        default: "default",
        choices: [
          { value: "default", label: "Disabled" },
          { value: "cdc", label: "Enabled" },
        ],
      },
      {
        key: "USBMode",
        label: "USB Modu",
        group: "USB",
        default: "hwcdc",
        choices: [
          { value: "hwcdc", label: "Hardware CDC and JTAG" },
          { value: "default", label: "USB-OTG" },
        ],
      },
    );
  }

  if (caps.psram) {
    opts.push({
      key: "PSRAM",
      label: "PSRAM",
      group: "Bellek",
      default: "enabled",
      choices: [
        { value: "enabled", label: "Enabled" },
        { value: "disabled", label: "Disabled" },
      ],
    });
  }

  if (caps.zigbee) {
    opts.push({
      key: "ZigbeeMode",
      label: "Zigbee Modu",
      group: "Kablosuz",
      default: "default",
      choices: [
        { value: "default", label: "Disabled" },
        { value: "ed", label: "Zigbee ED" },
        { value: "zczr", label: "Zigbee ZCZR" },
      ],
    });
  }

  return opts;
}

export function defaultOptionValues(fqbn: string): Record<string, string> {
  return Object.fromEntries(getBoardOptions(fqbn).map((o) => [o.key, o.default]));
}

const GROUP_ORDER: BoardOptionGroup[] = ["Performans", "Bellek", "USB", "Kablosuz", "Yükleme"];

export function groupedBoardOptions(fqbn: string): { group: BoardOptionGroup; options: BoardOption[] }[] {
  const options = getBoardOptions(fqbn);
  return GROUP_ORDER.map((group) => ({ group, options: options.filter((o) => o.group === group) })).filter(
    (g) => g.options.length > 0,
  );
}
