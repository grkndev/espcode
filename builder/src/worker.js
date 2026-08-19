import { Worker } from "bullmq";
import IORedis from "ioredis";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
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

// backend.plan.md §7.3 — kaynak dosyaya yazılır, komut satırına değil;
// execFile kullanılır (shell yorumlaması yok).
async function compileJob({ source, fqbn }) {
  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, error: "empty_source" };
  }
  if (!ALLOWED_FQBN.has(fqbn)) {
    return { ok: false, error: "unsupported_board" };
  }

  const jobDir = path.join(WORK_ROOT, randomUUID());
  const sketchDir = path.join(jobDir, "sketch");
  const buildDir = path.join(jobDir, "build");
  await mkdir(sketchDir, { recursive: true });
  await writeFile(path.join(sketchDir, "sketch.ino"), source, "utf8");

  try {
    const { stdout, stderr } = await execFileAsync(
      "arduino-cli",
      [
        "compile",
        "--fqbn",
        fqbn,
        "--jobs",
        COMPILE_JOBS,
        "--build-path",
        buildDir,
        sketchDir,
      ],
      { timeout: BUILD_TIMEOUT_SEC * 1000, maxBuffer: 16 * 1024 * 1024 },
    );

    const binPath = path.join(buildDir, "sketch.ino.bin");
    const elfPath = path.join(buildDir, "sketch.ino.elf");
    const [binStat, elfStat] = await Promise.all([stat(binPath), stat(elfPath)]);

    return {
      ok: true,
      flashBytes: binStat.size,
      elfBytes: elfStat.size,
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
