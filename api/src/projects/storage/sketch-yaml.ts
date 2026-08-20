import { CORE_VERSION } from '../../compile/build-key';

export interface LibraryDep {
  name: string;
  version: string;
}

export interface SketchYamlContent {
  fqbn: string;
  libraries: LibraryDep[];
}

const LIBRARY_LINE_RE = /^ {6}- (.+) \(([^)]+)\)\s*$/;
const [CORE_PACKAGE, CORE_PKG_VERSION] = CORE_VERSION.split('@');

// GithubStorageService ve PostgresProjectStorage'ın ortak serileştirme
// katmanı — sketch.yaml artık yalnızca GitHub sağlayıcısına özgü değil,
// kütüphane listesinin iki sağlayıcıda da taşındığı tek yer (Prisma
// migration'sız kalıcılık, bkz. docs/plans/…-design.md §4). "libraries" boşsa
// "profiles:" bloğu hiç yazılmaz — eski (kütüphanesiz) davranışla bire bir
// aynı, mevcut repolarda gereksiz diff üretmez.
export function renderSketchYaml({
  fqbn,
  libraries,
}: SketchYamlContent): string {
  if (libraries.length === 0) return `default_fqbn: ${fqbn}\n`;

  const libraryLines = libraries
    .map((d) => `      - ${d.name} (${d.version})`)
    .join('\n');
  return [
    `default_fqbn: ${fqbn}`,
    'profiles:',
    '  espcode:',
    `    fqbn: ${fqbn}`,
    '    platforms:',
    `      - platform: ${CORE_PACKAGE} (${CORE_PKG_VERSION})`,
    '    libraries:',
    libraryLines,
    '',
  ].join('\n');
}

export function parseSketchYaml(content: string): SketchYamlContent | null {
  const fqbnMatch = content.match(/^default_fqbn:\s*(\S+)\s*$/m);
  if (!fqbnMatch) return null;

  const libraries: LibraryDep[] = [];
  const librariesIdx = content.indexOf('\n    libraries:');
  if (librariesIdx !== -1) {
    const lines = content.slice(librariesIdx).split('\n').slice(2); // "\n" + "    libraries:" satırlarını atla
    for (const line of lines) {
      const m = line.match(LIBRARY_LINE_RE);
      if (!m) break;
      libraries.push({ name: m[1], version: m[2] });
    }
  }

  return { fqbn: fqbnMatch[1], libraries };
}
