#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const STYLES_DIR = path.join(ROOT_DIR, "styles");
const OUTPUT_FILE = path.join(STYLES_DIR, "style-prompts.generated.js");
const UI_FILE = path.join(ROOT_DIR, "ui.html");
const UI_START_MARKER = "/* STYLE_PROMPTS_GENERATED_START */";
const UI_END_MARKER = "/* STYLE_PROMPTS_GENERATED_END */";

function normalizeStyleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractSystemPrompt(doc, fileName) {
  const payload = doc && doc.system_prompt;

  if (typeof payload === "string") {
    return payload.trim();
  }

  if (payload && typeof payload === "object") {
    if (typeof payload.content === "string") {
      return payload.content.trim();
    }

    if (Array.isArray(payload.content)) {
      return payload.content.map((line) => String(line || "")).join("\n").trim();
    }
  }

  throw new Error("Missing or invalid system_prompt.content in " + fileName);
}

function loadStyleDocs() {
  if (!fs.existsSync(STYLES_DIR)) {
    throw new Error("styles directory not found at: " + STYLES_DIR);
  }

  const files = fs
    .readdirSync(STYLES_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error("No JSON style files found in: " + STYLES_DIR);
  }

  const presets = {};

  for (const fileName of files) {
    const fullPath = path.join(STYLES_DIR, fileName);
    const raw = fs.readFileSync(fullPath, "utf8");
    const doc = JSON.parse(raw);
    const styleLabel =
      typeof doc.style === "string" && doc.style.trim().length > 0
        ? doc.style
        : path.basename(fileName, ".json");
    const key = normalizeStyleKey(styleLabel);

    if (!key) {
      throw new Error("Could not derive style key for " + fileName);
    }

    if (Object.prototype.hasOwnProperty.call(presets, key)) {
      throw new Error("Duplicate style key '" + key + "' from " + fileName);
    }

    presets[key] = extractSystemPrompt(doc, fileName);
  }

  return presets;
}

function writeBundle(presets) {
  const output =
    "/* AUTO-GENERATED FILE. Run: node scripts/sync-style-prompts.js */\n" +
    "window.__STYLE_PROMPT_PRESETS__ = " +
    JSON.stringify(presets, null, 2) +
    ";\n";

  fs.writeFileSync(OUTPUT_FILE, output);
}

function updateUiInlinePrompts(presets) {
  if (!fs.existsSync(UI_FILE)) {
    throw new Error("ui.html not found at: " + UI_FILE);
  }

  const rawUi = fs.readFileSync(UI_FILE, "utf8");
  const pattern = new RegExp(
    "\\/\\* STYLE_PROMPTS_GENERATED_START \\*\\/[\\s\\S]*?\\/\\* STYLE_PROMPTS_GENERATED_END \\*\\/",
    "m"
  );

  if (!pattern.test(rawUi)) {
    throw new Error("Could not find style prompt markers in ui.html.");
  }

  const replacement =
    UI_START_MARKER +
    "\n" +
    "      const STYLE_PROMPT_PRESETS_BUNDLED = " +
    JSON.stringify(presets, null, 2)
      .replace(/\n/g, "\n      ") +
    ";\n" +
    "      " +
    UI_END_MARKER;

  const nextUi = rawUi.replace(pattern, replacement);
  fs.writeFileSync(UI_FILE, nextUi);
}

function main() {
  const presets = loadStyleDocs();
  writeBundle(presets);
  updateUiInlinePrompts(presets);
  const keys = Object.keys(presets);
  console.log(
    "Synced style prompts (" +
      keys.join(", ") +
      ") to " +
      path.relative(ROOT_DIR, OUTPUT_FILE) +
      " and " +
      path.relative(ROOT_DIR, UI_FILE) +
      "."
  );
  console.log(
    "Styles loaded from " +
      path.relative(ROOT_DIR, STYLES_DIR) +
      " with " +
      String(keys.length) +
      " json file prompt(s)."
  );
}

main();
