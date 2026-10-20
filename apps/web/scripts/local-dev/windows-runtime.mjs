import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  createWriteStream,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ROOT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const RUNTIME_DIR = join(ROOT_DIR, ".context/native");
const POSTGRES_SHA256 =
  "25e6fcdfb8caec38691bf461125e7564508760666f7b8e5dc6a5f0818f58f81e";
const REDIS_SHA256 =
  "7c8cebd50347eaa1d9e784da842ed47a4f33394637835531d6614777b950ee85";
const DOWNLOAD_TIMEOUT_MS = 600_000;
const DOWNLOAD_ATTEMPTS = 3;

/** Prepare portable development services inside this checkout without registering Windows services. */
async function main() {
  if (process.platform !== "win32")
    throw new Error("This helper is for Windows only.");
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error("Run the initial setup with Node.js 24.");
  mkdirSync(RUNTIME_DIR, { recursive: true });
  const nodeDir = join(RUNTIME_DIR, "node");
  mkdirSync(nodeDir, { recursive: true });
  const localNode = join(nodeDir, "node.exe");
  if (!existsSync(localNode)) copyFileSync(process.execPath, localNode);
  await Promise.all([
    prepareArchive(
      "PostgreSQL",
      "https://get.enterprisedb.com/postgresql/postgresql-16.15-1-windows-x64-binaries.zip",
      join(RUNTIME_DIR, "postgresql"),
      "pgsql/bin/postgres.exe",
      POSTGRES_SHA256,
    ),
    prepareArchive(
      "Redis",
      "https://github.com/redis-windows/redis-windows/releases/download/8.10.2/Redis-8.10.2-Windows-x64-msys2.zip",
      join(RUNTIME_DIR, "redis"),
      "Redis-8.10.2-Windows-x64-msys2/redis-server.exe",
      REDIS_SHA256,
    ),
  ]);
  console.log("[native] Portable services ready. Use Start-ProjectEmail.cmd.");
}

/** Download and extract a pinned public runtime archive, reusing an existing installation. */
async function prepareArchive(
  name,
  url,
  destination,
  executable,
  expectedDigest,
) {
  if (existsSync(join(destination, executable))) return;
  mkdirSync(destination, { recursive: true });
  const archive = join(RUNTIME_DIR, `${name.toLowerCase()}.zip`);

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    if (!existsSync(archive)) {
      console.log(
        `[native] Downloading ${name}${attempt > 1 ? ` (attempt ${attempt}/${DOWNLOAD_ATTEMPTS})` : ""}`,
      );
      try {
        await download(url, archive, name);
      } catch (error) {
        rmSync(`${archive}.part`, { force: true });
        if (attempt === DOWNLOAD_ATTEMPTS) throw error;
        console.log(`[native] ${name} download failed; retrying`);
        continue;
      }
    }

    if (!expectedDigest || sha256(archive) === expectedDigest) break;

    console.log(
      `[native] ${name} archive is incomplete (checksum mismatch); re-downloading`,
    );
    rmSync(archive, { force: true });
    if (attempt === DOWNLOAD_ATTEMPTS)
      throw new Error(`${name} archive checksum mismatch`);
  }

  execFileSync("tar.exe", ["-xf", archive, "-C", destination], {
    windowsHide: true,
    timeout: 120_000,
    stdio: "inherit",
  });
  if (!existsSync(join(destination, executable)))
    throw new Error(`${name} archive did not contain ${executable}`);
  console.log(`[native] ${name} ready`);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Stream to a .part file first so an interrupted download never looks complete. */
async function download(url, archive, name) {
  const partial = `${archive}.part`;
  rmSync(partial, { force: true });
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body)
    throw new Error(`${name} download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  renameSync(partial, archive);
}

main().catch((error) => {
  console.error(`[native] ${error.message}`);
  process.exitCode = 1;
});
