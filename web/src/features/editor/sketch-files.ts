// frontend.plan.md §3.2 — çoklu dosya sketch modeli
export interface SketchFile {
  path: string;
  content: string;
}

export const PRIMARY_FILE = "sketch.ino";

const FILE_NAME_RE = /^[\w.-]+\.(ino|cpp|h|hpp)$/;

export function isValidFileName(name: string): boolean {
  return FILE_NAME_RE.test(name) && name !== PRIMARY_FILE;
}

export function createDefaultSketch(): SketchFile[] {
  return [{ path: PRIMARY_FILE, content: "void setup() {\n\n}\n\nvoid loop() {\n\n}\n" }];
}

export function updateFileContent(files: SketchFile[], path: string, content: string): SketchFile[] {
  return files.map((f) => (f.path === path ? { ...f, content } : f));
}

export function addFile(files: SketchFile[], path: string): SketchFile[] {
  if (files.some((f) => f.path === path)) return files;
  return [...files, { path, content: "" }];
}

export function removeFile(files: SketchFile[], path: string): SketchFile[] {
  if (path === PRIMARY_FILE) return files; // birincil dosya silinemez
  return files.filter((f) => f.path !== path);
}
