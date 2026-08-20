import { Worker } from "bullmq";
import IORedis from "ioredis";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

const REDIS_URL = process.env.REDIS_URL;
const BUILD_TIMEOUT_SEC = Number(process.env.BUILD_TIMEOUT_SEC ?? "120");
const COMPILE_JOBS = process.env.COMPILE_JOBS ?? "2";
const WORK_ROOT = "/work";

// backend.plan.md §7.3 — kullanıcıdan gelen hiçbir string derleme komut
// satırına doğrudan geçmez; FQBN sabit bir allowlist'ten seçilir.
const ALLOWED_FQBN = new Set([
  "esp32:esp32:esp32",
  "esp32:esp32:esp32c3",
  "esp32:esp32:esp32s3",
  "esp32:esp32:esp32c6",
]);

async function ensureArduinoConfig() {
  await execFileAsync("arduino-cli", ["config", "init", "--dest-dir", "/tmp", "--overwrite"]);
}

// api/src/compile/allowed-fqbn.ts'in aynısı — kart seçenekleri FQBN'e
// :key=value,... olarak ekleniyor. Bilinmeyen bir anahtar/değer arduino-cli'de
// derleme hatasına düşer, güvenlik riski oluşturmaz.
const OPTION_TOKEN = /^[A-Za-z0-9_]+$/;
function buildExtendedFqbn(fqbn, options) {
  if (!options || Object.keys(options).length === 0) return fqbn;
  const parts = Object.entries(options)
    .filter(([k, v]) => OPTION_TOKEN.test(k) && OPTION_TOKEN.test(String(v)))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? `${fqbn}:${parts.join(",")}` : fqbn;
}

// frontend.plan.md §3.2 — düz dosya adı, izin verilen uzantı; alt klasör veya
// path traversal yok (worker bu adları doğrudan diske yazıyor).
const FILE_NAME_RE = /^[\w.-]+\.(ino|cpp|h|hpp)$/;

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return "empty_source";
  if (!files.some((f) => f.path === "sketch.ino")) return "missing_primary_file";
  for (const f of files) {
    if (typeof f.path !== "string" || !FILE_NAME_RE.test(f.path)) return "invalid_file_name";
    if (typeof f.content !== "string") return "invalid_file_content";
  }
  return null;
}

// backend.plan.md §7.3 — kaynak dosyaya yazılır, komut satırına değil;
// execFile kullanılır (shell yorumlaması yok).
async function compileJob({ files, fqbn, options }) {
  const invalid = validateFiles(files);
  if (invalid) return { ok: false, error: invalid };
  if (!ALLOWED_FQBN.has(fqbn)) {
    return { ok: false, error: "unsupported_board" };
  }

  const jobDir = path.join(WORK_ROOT, randomUUID());
  const sketchDir = path.join(jobDir, "sketch");
  const buildDir = path.join(jobDir, "build");
  await mkdir(sketchDir, { recursive: true });
  await Promise.all(
    files.map((f) => writeFile(path.join(sketchDir, f.path), f.content, "utf8")),
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      "arduino-cli",
      [
        "compile",
        "--fqbn",
        buildExtendedFqbn(fqbn, options),
        "--jobs",
        COMPILE_JOBS,
        "--build-path",
        buildDir,
        // --export-binaries olmadan sadece uygulama parçası (sketch.ino.bin)
        // üretilir, 0x10000 (partition şemasına göre değişen) bir ofsete
        // yazılması gerekir. merged.bin bootloader+partition+app'i doğru
        // ofsetlerde birleştirir, 0x0'dan tek parça yazılabilir (frontend
        // Faz 1'de doğrulanmış yol).
        "--export-binaries",
        sketchDir,
      ],
      { timeout: BUILD_TIMEOUT_SEC * 1000, maxBuffer: 16 * 1024 * 1024 },
    );

    const binPath = path.join(buildDir, "sketch.ino.merged.bin");
    const elfPath = path.join(buildDir, "sketch.ino.elf");
    const [binStat, elfStat, binBuf] = await Promise.all([
      stat(binPath),
      stat(elfPath),
      readFile(binPath),
    ]);

    // R2 henüz bağlı değil (master.plan.md §6.2 — kimlik bilgisi yok); geçici
    // olarak derlenmiş .bin doğrudan job sonucunda base64 taşınıyor.
    return {
      ok: true,
      flashBytes: binStat.size,
      elfBytes: elfStat.size,
      binBase64: binBuf.toString("base64"),
      log: stdout + stderr,
    };
  } catch (err) {
    const timedOut = err.killed && err.signal === "SIGTERM";
    return {
      ok: false,
      error: timedOut ? "timeout" : "compile_failed",
      log: [err.stdout, err.stderr].filter(Boolean).join("\n") || String(err),
    };
  } finally {
    await rm(jobDir, { recursive: true, force: true });
  }
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// backend.plan.md §5.2 — concurrency:1, lockDuration build timeout'undan uzun
const worker = new Worker("builds", (job) => compileJob(job.data), {
  connection,
  concurrency: 1,
  lockDuration: 180_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
  limiter: { max: 30, duration: 60_000 },
});

worker.on("completed", (job, result) => {
  console.log(`[worker] job ${job.id} tamamlandı — ${result.ok ? "başarılı" : result.error}`);
});
worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} çöktü:`, err.message);
});

ensureArduinoConfig()
  .then(() => console.log("[worker] arduino-cli hazır, 'builds' kuyruğu dinleniyor"))
  .catch((err) => {
    console.error("[worker] arduino-cli config başarısız:", err);
    process.exit(1);
  });
