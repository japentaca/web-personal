#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETS_FILE = path.join(__dirname, "sets.js");

const args = new Set(process.argv.slice(2));
const setArg = process.argv.find((arg) => arg.startsWith("--set="));
const precisionArg = process.argv.find((arg) => arg.startsWith("--precision="));
const ffprobeArg = process.argv.find((arg) => arg.startsWith("--ffprobe="));
const ffmpegArg = process.argv.find((arg) => arg.startsWith("--ffmpeg="));

const selectedSetName = setArg ? setArg.slice("--set=".length).trim() : "";
const write = args.has("--write");
const precision = Number.parseInt(precisionArg ? precisionArg.slice("--precision=".length) : "3", 10);
const ffprobeBin = ffprobeArg
  ? ffprobeArg.slice("--ffprobe=".length).trim()
  : (process.env.FFPROBE_BIN || "ffprobe");
const ffmpegBin = ffmpegArg
  ? ffmpegArg.slice("--ffmpeg=".length).trim()
  : (process.env.FFMPEG_BIN || "ffmpeg");

function loadSetsFromSource(source) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${source}\n;this.__sets = sets;`, sandbox, { filename: "sets.js" });

  if (!sandbox.__sets || typeof sandbox.__sets !== "object") {
    throw new Error("No se pudo cargar el objeto sets desde sets.js");
  }

  return sandbox.__sets;
}

function formatDuration(seconds) {
  const clampedPrecision = Number.isInteger(precision) ? Math.min(Math.max(precision, 0), 6) : 3;
  return Number(seconds.toFixed(clampedPrecision)).toString();
}

function parseDurationClock(text) {
  const match = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);
  const total = (hours * 3600) + (minutes * 60) + seconds;

  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  return total;
}

function probeDurationSeconds(absoluteAudioPath) {
  try {
    const output = execFileSync(
      ffprobeBin,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        absoluteAudioPath
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();

    const duration = Number.parseFloat(output);
    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
  } catch {
    // Fallback below.
  }

  const probe = spawnSync(
    ffmpegBin,
    ["-i", absoluteAudioPath, "-f", "null", "-"],
    { encoding: "utf8" }
  );

  if (probe.error) {
    throw new Error(`No se pudo ejecutar ffprobe (${ffprobeBin}) ni ffmpeg (${ffmpegBin})`);
  }

  const clockDuration = parseDurationClock(`${probe.stdout || ""}\n${probe.stderr || ""}`);
  if (clockDuration !== null) {
    return clockDuration;
  }

  throw new Error(`No se pudo extraer duracion para ${absoluteAudioPath} con ffprobe/ffmpeg`);
}

function collectAudioEntries(setsObject) {
  const setNames = selectedSetName ? [selectedSetName] : Object.keys(setsObject);
  const entries = [];

  for (const setName of setNames) {
    const setDef = setsObject[setName];
    if (!setDef) {
      throw new Error(`No existe el set '${setName}' en sets.js`);
    }

    if (!Array.isArray(setDef.files)) {
      continue;
    }

    for (const fileDef of setDef.files) {
      if (!fileDef || typeof fileDef.path !== "string" || !fileDef.path.trim()) {
        continue;
      }

      const relativePath = fileDef.path.trim();
      entries.push({
        setName,
        relativePath,
        absolutePath: path.join(__dirname, relativePath)
      });
    }
  }

  return entries;
}

function injectDurations(source, targetPaths, durationByPath) {
  const objectWithPathRegex = /\{([^{}]*\bpath\s*:\s*"([^"]+)"[^{}]*)\}/g;
  let touched = 0;

  const updated = source.replace(objectWithPathRegex, (fullMatch, objectBody, matchedPath) => {
    const audioPath = matchedPath.trim();
    if (!targetPaths.has(audioPath) || !durationByPath.has(audioPath)) {
      return fullMatch;
    }

    const durationLiteral = formatDuration(durationByPath.get(audioPath));
    let nextBody = objectBody;

    if (/\bdurationSec\s*:/.test(nextBody)) {
      nextBody = nextBody.replace(/\bdurationSec\s*:\s*[-+]?\d*\.?\d+/, `durationSec: ${durationLiteral}`);
    } else {
      if (/(\bpath\s*:\s*"[^"]+"\s*,)/.test(nextBody)) {
        nextBody = nextBody.replace(
          /(\bpath\s*:\s*"[^"]+"\s*,)/,
          `$1 durationSec: ${durationLiteral},`
        );
      } else {
        nextBody = nextBody.replace(
          /(\bpath\s*:\s*"[^"]+")/,
          `$1, durationSec: ${durationLiteral}`
        );
      }
    }

    if (nextBody !== objectBody) {
      touched += 1;
    }

    return `{${nextBody}}`;
  });

  return { updated, touched };
}

async function main() {
  console.log(`Usando ffprobe: ${ffprobeBin}`);
  console.log(`Usando ffmpeg : ${ffmpegBin}`);

  let source = await fs.readFile(SETS_FILE, "utf8");
  const setsObject = loadSetsFromSource(source);
  const entries = collectAudioEntries(setsObject);

  if (entries.length === 0) {
    throw new Error("No se encontraron archivos de audio para procesar");
  }

  const uniquePaths = [...new Set(entries.map((entry) => entry.relativePath))];
  const durationByPath = new Map();

  for (const relativePath of uniquePaths) {
    const absolutePath = path.join(__dirname, relativePath);
    try {
      await fs.access(absolutePath);
    } catch {
      console.warn(`Aviso: no existe ${relativePath}, se omite`);
      continue;
    }

    const seconds = probeDurationSeconds(absolutePath);
    durationByPath.set(relativePath, seconds);
    console.log(`Duracion ${relativePath}: ${formatDuration(seconds)}s`);
  }

  const targetPaths = new Set(uniquePaths);
  const { updated, touched } = injectDurations(source, targetPaths, durationByPath);

  if (touched === 0) {
    console.log("Sin cambios: no se inyecto durationSec en ningun item");
    return;
  }

  if (write) {
    await fs.writeFile(SETS_FILE, updated, "utf8");
    console.log(`Listo: sets.js actualizado (${touched} items)`);
  } else {
    const previewFile = path.join(__dirname, "sets.durations.preview.js");
    await fs.writeFile(previewFile, updated, "utf8");
    console.log(`Preview generado: ${previewFile}`);
    console.log("Para aplicar cambios ejecuta: node espacio/audio/annotate-durations.mjs --write");
  }

  source = updated;
}

main().catch((error) => {
  if (error && error.message && /(ffprobe|ffmpeg)/i.test(error.message)) {
    console.error("No se pudo ejecutar ffprobe/ffmpeg. Define rutas con --ffprobe y --ffmpeg o usa FFPROBE_BIN y FFMPEG_BIN.");
    console.error(error.message);
  } else {
    console.error(error.message || error);
  }
  process.exitCode = 1;
});
