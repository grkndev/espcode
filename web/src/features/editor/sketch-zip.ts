import { strToU8, zipSync } from "fflate";
import { PRIMARY_FILE, type SketchFile } from "./sketch-files";
import type { LibraryDep } from "@/features/libraries/useLibraries";

// api/src/compile/build-key.ts'teki CORE_VERSION ile birebir aynı olmalı —
// burada tekrarlanıyor çünkü web paketi api koduna erişemiyor (bkz.
// sketch-files.ts'teki PRIMARY_FILE'ın aynı gerekçeyle tekrarlanması).
const CORE_VERSION = "esp32:esp32@3.3.11";

function slugifyFolderName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9._-]+/g, "_") || "sketch";
}

// api/src/projects/storage/sketch-yaml.ts'in frontend eşleniği — gerçek
// Arduino IDE / arduino-cli'nin `--profile espcode` ile açabileceği aynı
// format. Kütüphane yoksa yalnızca fqbn taşıyan dejenere tek satır (aynı
// sözleşme, gereksiz karmaşıklık yok).
function renderSketchYaml(fqbn: string, libraries: LibraryDep[]): string {
  if (libraries.length === 0) return `default_fqbn: ${fqbn}\n`;

  const [corePackage, corePkgVersion] = CORE_VERSION.split("@");
  const libraryLines = libraries.map((d) => `      - ${d.name} (${d.version})`).join("\n");
  return [
    `default_fqbn: ${fqbn}`,
    "profiles:",
    "  espcode:",
    `    fqbn: ${fqbn}`,
    "    platforms:",
    `      - platform: ${corePackage} (${corePkgVersion})`,
    "    libraries:",
    libraryLines,
    "",
  ].join("\n");
}

// "İndir (.ino)" — Arduino IDE'nin kendi kuralı gereği tek dosya değil,
// <sketch-adı>/<sketch-adı>.ino içeren bir klasör (dosya adı ≠ sketch.ino);
// kütüphane eklenmişse yanına gerçek Arduino IDE'de de kullanılabilecek bir
// sketch.yaml eklenir. Birden fazla dosya söz konusu olduğu için (ve
// Arduino IDE zaten klasör beklediği için) her zaman zip.
export function buildSketchZip(
  files: SketchFile[],
  fqbn: string,
  libraries: LibraryDep[],
  sketchName: string,
): Uint8Array {
  const folder = slugifyFolderName(sketchName);
  const entries: Record<string, Uint8Array> = {};

  for (const file of files) {
    const repoName = file.path === PRIMARY_FILE ? `${folder}.ino` : file.path;
    entries[`${folder}/${repoName}`] = strToU8(file.content);
  }
  if (libraries.length > 0) {
    entries[`${folder}/sketch.yaml`] = strToU8(renderSketchYaml(fqbn, libraries));
  }

  return zipSync(entries);
}
