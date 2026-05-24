#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETS_FILE = path.join(__dirname, "sets.js");
const CACHE_FILE = path.join(__dirname, "set4.transcripts.json");
const STT_PROVIDER = (process.env.STT_PROVIDER || "openrouter").toLowerCase();
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = process.env.OPENROUTER_STT_MODEL || "openai/whisper-1";
const OPENAI_MODEL = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";
const GROQ_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
const LANGUAGE = process.env.OPENROUTER_STT_LANGUAGE || "es";
const REQUEST_DELAY_MS = Number.parseInt(
  process.env.STT_DELAY_MS || process.env.OPENROUTER_STT_DELAY_MS || "5000",
  10
);

const args = new Set(process.argv.slice(2));
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlyPath = onlyArg ? onlyArg.slice("--only=".length).trim() : "";
const dryRun = args.has("--dry-run");
const force = args.has("--force");

async function loadEnvFile() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");

  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function findMatchingBracket(source, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringQuote = ch;
      continue;
    }

    if (ch === openChar) {
      depth += 1;
      continue;
    }

    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function escapeJsString(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n")
    .replace(/\"/g, "\\\"");
}

function unescapeJsString(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseSet4Files(source) {
  const set4KeyIndex = source.indexOf("set4:");
  if (set4KeyIndex === -1) {
    throw new Error("No se encontro set4 en sets.js");
  }

  const set4Open = source.indexOf("{", set4KeyIndex);
  const set4Close = findMatchingBracket(source, set4Open, "{", "}");
  if (set4Open === -1 || set4Close === -1) {
    throw new Error("No se pudo parsear el bloque de set4");
  }

  const filesKeyIndex = source.indexOf("files:", set4KeyIndex);
  if (filesKeyIndex === -1 || filesKeyIndex > set4Close) {
    throw new Error("No se encontro files dentro de set4");
  }

  const arrayOpen = source.indexOf("[", filesKeyIndex);
  const arrayClose = findMatchingBracket(source, arrayOpen, "[", "]");
  if (arrayOpen === -1 || arrayClose === -1 || arrayClose > set4Close) {
    throw new Error("No se pudo parsear files[] dentro de set4");
  }

  const arrayText = source.slice(arrayOpen + 1, arrayClose);
  const fileEntries = [];
  const objectRegex = /\{([^{}]*)\}/g;

  for (const match of arrayText.matchAll(objectRegex)) {
    const body = match[1];
    const pathMatch = body.match(/path\s*:\s*"([^"]+)"/);
    if (!pathMatch) {
      continue;
    }

    const textMatch = body.match(/text\s*:\s*"((?:\\.|[^"\\])*)"/);
    fileEntries.push({
      path: pathMatch[1],
      text: textMatch ? unescapeJsString(textMatch[1]) : ""
    });
  }

  if (fileEntries.length === 0) {
    throw new Error("No se encontraron paths en set4.files");
  }

  return {
    arrayOpen,
    arrayClose,
    fileEntries
  };
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  const sorted = Object.fromEntries(
    Object.entries(cache).sort((a, b) => a[0].localeCompare(b[0]))
  );
  await fs.writeFile(CACHE_FILE, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeFile({ absoluteFilePath, relativePath, apiKey }) {
  const fileBuffer = await fs.readFile(absoluteFilePath);
  const form = new FormData();

  form.append("file", new Blob([fileBuffer]), path.basename(absoluteFilePath));

  let endpoint = "";
  let headers = {};

  if (STT_PROVIDER === "openrouter") {
    endpoint = `${OPENROUTER_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`;
    form.append("model", OPENROUTER_MODEL);
    headers = {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://localhost/mi-web",
      "X-Title": "mi-web set4 transcription"
    };
  } else if (STT_PROVIDER === "openai") {
    endpoint = "https://api.openai.com/v1/audio/transcriptions";
    form.append("model", OPENAI_MODEL);
    headers = {
      Authorization: `Bearer ${apiKey}`
    };
  } else if (STT_PROVIDER === "groq") {
    endpoint = "https://api.groq.com/openai/v1/audio/transcriptions";
    form.append("model", GROQ_MODEL);
    headers = {
      Authorization: `Bearer ${apiKey}`
    };
  } else {
    throw new Error(`STT_PROVIDER no soportado: ${STT_PROVIDER}`);
  }

  if (LANGUAGE) {
    form.append("language", LANGUAGE);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: form
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error ${response.status} transcribiendo ${relativePath}: ${errorBody}`);
  }

  const payload = await response.json();
  const text =
    typeof payload.text === "string"
      ? payload.text
      : typeof payload.transcript === "string"
        ? payload.transcript
        : typeof payload.output_text === "string"
          ? payload.output_text
          : "";

  if (!text.trim()) {
    throw new Error(`Respuesta sin texto para ${relativePath}: ${JSON.stringify(payload)}`);
  }

  return text.trim();
}

function injectTextsInSet4(source, pathsInOrder, transcriptsByPath, arrayOpen, arrayClose) {
  const rebuiltRows = pathsInOrder.map((audioPath) => {
    const transcript = transcriptsByPath[audioPath] || "";
    return `      { path: "${audioPath}", text: "${escapeJsString(transcript)}" },`;
  });

  const replacedArrayBody = `\n${rebuiltRows.join("\n")}\n\n    `;
  return source.slice(0, arrayOpen + 1) + replacedArrayBody + source.slice(arrayClose);
}

async function persistSetsFile(currentSource, paths, transcriptsByPath) {
  const parsed = parseSet4Files(currentSource);
  const updatedSource = injectTextsInSet4(
    currentSource,
    paths,
    transcriptsByPath,
    parsed.arrayOpen,
    parsed.arrayClose
  );

  await fs.writeFile(SETS_FILE, updatedSource, "utf8");
  return updatedSource;
}

async function main() {
  await loadEnvFile();

  const apiKey =
    STT_PROVIDER === "openrouter"
      ? process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY
      : STT_PROVIDER === "openai"
        ? process.env.OPENAI_API_KEY
        : STT_PROVIDER === "groq"
          ? process.env.GROQ_API_KEY
          : "";

  if (!apiKey) {
    throw new Error(
      STT_PROVIDER === "openrouter"
        ? "Falta OPENROUTER_API_KEY o OPEN_ROUTER_API_KEY en variables de entorno"
        : STT_PROVIDER === "openai"
          ? "Falta OPENAI_API_KEY en variables de entorno"
          : STT_PROVIDER === "groq"
            ? "Falta GROQ_API_KEY en variables de entorno"
            : `Proveedor no soportado: ${STT_PROVIDER}`
    );
  }

  let source = await fs.readFile(SETS_FILE, "utf8");
  const { fileEntries } = parseSet4Files(source);
  const paths = fileEntries.map((entry) => entry.path);
  const existingTranscriptsByPath = {};

  for (const entry of fileEntries) {
    if (typeof entry.text === "string" && entry.text.trim() && !existingTranscriptsByPath[entry.path]) {
      existingTranscriptsByPath[entry.path] = entry.text.trim();
    }
  }

  const cache = await loadCache();
  const transcriptsByPath = { ...existingTranscriptsByPath };

  for (const [audioPath, transcript] of Object.entries(cache)) {
    if (typeof transcript === "string" && transcript.trim() && paths.includes(audioPath)) {
      transcriptsByPath[audioPath] = transcript.trim();
    }
  }

  // Al iniciar, vuelca cache+existente para recuperar avance de corridas interrumpidas.
  source = await persistSetsFile(source, paths, transcriptsByPath);

  const selectedPaths = onlyPath ? paths.filter((p) => p === onlyPath) : paths;
  if (onlyPath && selectedPaths.length === 0) {
    throw new Error(`El archivo indicado con --only no existe en set4.files: ${onlyPath}`);
  }

  for (const relativePath of selectedPaths) {
    const absoluteFilePath = path.join(__dirname, relativePath);

    try {
      await fs.access(absoluteFilePath);
    } catch {
      console.warn(`Aviso: no existe ${relativePath}, se omite`);
      continue;
    }

    if (!force && typeof existingTranscriptsByPath[relativePath] === "string" && existingTranscriptsByPath[relativePath].trim()) {
      console.log(`Set existente: ${relativePath}`);
      continue;
    }

    if (!force && typeof cache[relativePath] === "string" && cache[relativePath].trim()) {
      console.log(`Cache: ${relativePath}`);
      continue;
    }

    console.log(`Transcribiendo: ${relativePath}`);
    const transcript = await transcribeFile({ absoluteFilePath, relativePath, apiKey });
    cache[relativePath] = transcript;
    transcriptsByPath[relativePath] = transcript;
    await saveCache(cache);
    source = await persistSetsFile(source, paths, transcriptsByPath);
    console.log(`Guardado incremental: ${relativePath}`);

    if (REQUEST_DELAY_MS > 0) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const updatedSource = await persistSetsFile(source, paths, transcriptsByPath);

  if (dryRun) {
    const previewPath = path.join(__dirname, "sets.preview.js");
    await fs.writeFile(previewPath, updatedSource, "utf8");
    console.log(`Dry run listo: ${previewPath}`);
    return;
  }

  await fs.writeFile(SETS_FILE, updatedSource, "utf8");
  console.log("Listo: set4 en sets.js actualizado con textos");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
