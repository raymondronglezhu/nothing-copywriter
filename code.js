const APP_VERSION = "2026-02-25-nc1";

figma.showUI(__html__, { width: 460, height: 760, themeColors: true });

const MAX_DIAGNOSTICS = 300;
const MAX_UNDO_STACK = 20;
const SETTINGS_STORAGE_KEY = "copywriter-settings-v1";

const diagnostics = [];
const undoStack = [];

let lastSelectionSnapshot = "";
let uiReady = false;
let bootWatchdog = null;

function trimString(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength) + "...(truncated)";
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return { note: "Unserializable diagnostic details." };
  }
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: trimString(error.name || "Error", 120),
      message: trimString(error.message || "Unknown error", 800),
      stack: trimString(error.stack || "", 4000)
    };
  }

  if (typeof error === "string") {
    return { message: trimString(error, 800) };
  }

  return { message: trimString(String(error || "Unknown error"), 800) };
}

function postUIMessage(payload) {
  try {
    figma.ui.postMessage(payload);
  } catch (error) {
    // Ignore UI post failures (for example if UI has been closed).
  }
}

function pushDiagnostic(level, message, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    source: "main",
    level,
    message: trimString(message || "No message", 800),
    details: safeJson(details)
  };

  diagnostics.push(entry);
  if (diagnostics.length > MAX_DIAGNOSTICS) {
    diagnostics.shift();
  }

  postUIMessage({
    type: "DIAGNOSTIC_EVENT",
    entry
  });
}

function sendDiagnosticSnapshot() {
  postUIMessage({
    type: "DIAGNOSTICS_SNAPSHOT",
    entries: diagnostics
  });

  postUIMessage({
    type: "APP_META",
    version: APP_VERSION
  });
}

function escapeForHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmergencyUI(reason) {
  const safeReason = escapeForHtml(reason);
  const safeVersion = escapeForHtml(APP_VERSION);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Nothing Copywriter Diagnostics</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 12px; color: #1b2b40; background: #f4f7fb; }
      h1 { font-size: 14px; margin: 0 0 8px; }
      p { font-size: 12px; margin: 0 0 8px; }
      .row { display: flex; gap: 8px; margin-bottom: 8px; }
      button { border: 0; border-radius: 7px; padding: 8px 10px; cursor: pointer; font-size: 12px; }
      .primary { background: #1357d6; color: #fff; }
      .ghost { background: #e7eef9; color: #173d7a; }
      pre { margin: 0; border: 1px solid #c9d6ea; border-radius: 8px; background: #fff; padding: 8px; max-height: 420px; overflow: auto; font-size: 11px; white-space: pre-wrap; }
      .hint { color: #4a5d79; }
    </style>
  </head>
  <body>
    <h1>Nothing Copywriter Emergency Diagnostics</h1>
    <p class="hint">Main UI did not boot. Reason: ${safeReason}</p>
    <p class="hint">Build: main-${safeVersion}</p>
    <div class="row">
      <button id="sync" class="ghost" type="button">Sync Logs</button>
      <button id="copy" class="primary" type="button">Copy Logs</button>
    </div>
    <pre id="log">Waiting for diagnostics...</pre>
    <script>
      var current = "Waiting for diagnostics...";
      function write(text) {
        current = text;
        document.getElementById("log").textContent = text;
      }
      function request() {
        parent.postMessage({ pluginMessage: { type: "REQUEST_DIAGNOSTICS" } }, "*");
      }
      window.onmessage = function(event) {
        var msg = event && event.data && event.data.pluginMessage;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "DIAGNOSTICS_SNAPSHOT") {
          try {
            write(JSON.stringify(msg.entries || [], null, 2));
          } catch (err) {
            write("Failed to render diagnostics.");
          }
        }
      };
      document.getElementById("sync").addEventListener("click", request);
      document.getElementById("copy").addEventListener("click", function() {
        try {
          navigator.clipboard.writeText(current);
        } catch (err) {}
      });
      request();
    </script>
  </body>
</html>`;
}

function activateEmergencyUI(reason) {
  pushDiagnostic("error", "Activating emergency diagnostics UI.", {
    reason
  });

  figma.showUI(buildEmergencyUI(reason), { width: 460, height: 620, themeColors: true });
  sendDiagnosticSnapshot();
}

function startBootWatchdog() {
  if (bootWatchdog) {
    clearTimeout(bootWatchdog);
  }

  bootWatchdog = setTimeout(() => {
    if (!uiReady) {
      activateEmergencyUI("No UI_READY handshake within 4 seconds.");
    }
  }, 4000);
}

function hasUndoAvailable() {
  return undoStack.length > 0;
}

function pushUndoSnapshot(snapshot) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return;
  }

  undoStack.push(snapshot);
  if (undoStack.length > MAX_UNDO_STACK) {
    undoStack.shift();
  }
}

function collectTextNodes(node, acc) {
  if (node.type === "TEXT") {
    acc.push(node);
    return;
  }

  if ("children" in node) {
    for (const child of node.children) {
      collectTextNodes(child, acc);
    }
  }
}

function getSelectionTextNodes() {
  const selected = figma.currentPage.selection;
  const textNodes = [];

  for (const node of selected) {
    collectTextNodes(node, textNodes);
  }

  return textNodes;
}

function safeGetTextCharacters(node) {
  try {
    return node.characters;
  } catch (error) {
    pushDiagnostic("warn", "Unable to read node characters.", {
      nodeId: node.id,
      error: serializeError(error)
    });
    return "";
  }
}

function sendSelectionToUI() {
  const selected = figma.currentPage.selection;
  const textNodes = getSelectionTextNodes();
  const snapshot = selected.length + ":" + textNodes.length + ":" + String(hasUndoAvailable());

  if (snapshot !== lastSelectionSnapshot) {
    lastSelectionSnapshot = snapshot;
    pushDiagnostic("info", "Selection synced.", {
      selectionCount: selected.length,
      textNodeCount: textNodes.length,
      undoAvailable: hasUndoAvailable()
    });
  }

  postUIMessage({
    type: "SELECTION_TEXTS",
    selectionCount: selected.length,
    textNodeCount: textNodes.length,
    undoAvailable: hasUndoAvailable(),
    items: textNodes.map((node, index) => {
      let parentName = "Unknown parent";

      if (node.parent && "name" in node.parent) {
        parentName = node.parent.name || parentName;
      }

      return {
        id: node.id,
        name: node.name || "Text " + String(index + 1),
        parentName,
        characters: safeGetTextCharacters(node),
        hasMissingFont: Boolean(node.hasMissingFont)
      };
    })
  });
}

function sanitizeSettings(input) {
  const settings = {
    apiKey: "",
    model: "gpt-5.2",
    stylePreset: "generic_ux",
    customGuide: ""
  };

  function sanitizeStylePresetValue(value) {
    if (value === "generic_ux" || value === "nothing_style" || value === "custom") {
      return value;
    }

    if (value === "clear" || value === "professional" || value === "friendly" || value === "persuasive") {
      return "generic_ux";
    }

    return "generic_ux";
  }

  if (!input || typeof input !== "object") {
    return settings;
  }

  if (typeof input.apiKey === "string") {
    settings.apiKey = trimString(input.apiKey.trim(), 400);
  }

  if (typeof input.model === "string" && input.model.trim().length > 0) {
    settings.model = trimString(input.model.trim(), 120);
  }

  if (typeof input.stylePreset === "string" && input.stylePreset.trim().length > 0) {
    settings.stylePreset = sanitizeStylePresetValue(trimString(input.stylePreset.trim(), 80));
  }

  if (typeof input.customGuide === "string") {
    settings.customGuide = trimString(input.customGuide, 4000);
  }

  return settings;
}

async function sendPersistedSettings() {
  try {
    const stored = await figma.clientStorage.getAsync(SETTINGS_STORAGE_KEY);
    const settings = sanitizeSettings(stored);

    postUIMessage({
      type: "PERSISTED_SETTINGS",
      settings
    });

    pushDiagnostic("info", "Persisted settings loaded.", {
      hasApiKey: Boolean(settings.apiKey),
      model: settings.model,
      stylePreset: settings.stylePreset
    });
  } catch (error) {
    pushDiagnostic("warn", "Failed to load persisted settings.", {
      error: serializeError(error)
    });
  }
}

async function savePersistedSettings(input) {
  const settings = sanitizeSettings(input);

  try {
    await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, settings);

    pushDiagnostic("info", "Settings saved.", {
      hasApiKey: Boolean(settings.apiKey),
      model: settings.model,
      stylePreset: settings.stylePreset
    });
  } catch (error) {
    pushDiagnostic("warn", "Failed to persist settings.", {
      error: serializeError(error)
    });
  }
}

async function loadFontsForNode(node) {
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
    return;
  }

  if (node.characters.length === 0) {
    return;
  }

  const fonts = node.getRangeAllFontNames(0, node.characters.length);
  const seen = new Set();
  const uniqueFonts = [];

  for (const font of fonts) {
    const key = font.family + "::" + font.style;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFonts.push(font);
    }
  }

  for (const font of uniqueFonts) {
    await figma.loadFontAsync(font);
  }
}

async function applyCopyUpdates(updates) {
  let applied = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];
  const undoSnapshot = [];

  pushDiagnostic("info", "Applying copy updates.", {
    updateCount: updates.length
  });

  for (const update of updates) {
    const updateId = update && typeof update.id === "string" ? update.id : "";
    const node = updateId ? figma.getNodeById(updateId) : null;

    if (!updateId || !node || node.type !== "TEXT") {
      failed += 1;
      errors.push({ id: updateId || "unknown", reason: "Text node not found." });
      continue;
    }

    try {
      if (node.hasMissingFont) {
        throw new Error("Node has missing fonts. Resolve missing fonts before applying copy.");
      }

      const nextText = typeof update.text === "string" ? update.text : "";
      const previousText = node.characters;

      if (previousText === nextText) {
        skipped += 1;
        continue;
      }

      await loadFontsForNode(node);
      node.characters = nextText;
      applied += 1;

      undoSnapshot.push({
        id: updateId,
        text: previousText
      });
    } catch (error) {
      failed += 1;
      errors.push({
        id: updateId,
        reason: error && error.message ? error.message : "Unknown error while updating text."
      });
    }
  }

  if (undoSnapshot.length > 0) {
    pushUndoSnapshot(undoSnapshot);
  }

  pushDiagnostic(failed > 0 ? "warn" : "info", "Apply finished.", {
    applied,
    failed,
    skipped,
    undoAvailable: hasUndoAvailable(),
    errors: errors.slice(0, 20)
  });

  return {
    applied,
    failed,
    skipped,
    errors,
    undoAvailable: hasUndoAvailable()
  };
}

async function undoLastApply() {
  if (!hasUndoAvailable()) {
    return {
      restored: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      undoAvailable: false
    };
  }

  const snapshot = undoStack.pop();
  let restored = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];
  const retrySnapshot = [];

  pushDiagnostic("info", "Undo requested.", {
    itemCount: snapshot.length
  });

  for (const item of snapshot) {
    const itemId = item && typeof item.id === "string" ? item.id : "";
    const node = itemId ? figma.getNodeById(itemId) : null;

    if (!itemId || !node || node.type !== "TEXT") {
      failed += 1;
      errors.push({ id: itemId || "unknown", reason: "Text node not found for undo." });
      continue;
    }

    try {
      if (node.hasMissingFont) {
        throw new Error("Node has missing fonts. Resolve missing fonts before undo.");
      }

      const previousText = typeof item.text === "string" ? item.text : "";

      if (node.characters === previousText) {
        skipped += 1;
        continue;
      }

      await loadFontsForNode(node);
      node.characters = previousText;
      restored += 1;
    } catch (error) {
      failed += 1;
      retrySnapshot.push({
        id: itemId,
        text: typeof item.text === "string" ? item.text : ""
      });
      errors.push({
        id: itemId,
        reason: error && error.message ? error.message : "Unknown error while undoing text."
      });
    }
  }

  if (retrySnapshot.length > 0) {
    pushUndoSnapshot(retrySnapshot);
  }

  pushDiagnostic(failed > 0 ? "warn" : "info", "Undo finished.", {
    restored,
    failed,
    skipped,
    undoAvailable: hasUndoAvailable(),
    errors: errors.slice(0, 20)
  });

  return {
    restored,
    failed,
    skipped,
    errors,
    undoAvailable: hasUndoAvailable()
  };
}

figma.on("selectionchange", () => {
  try {
    sendSelectionToUI();
  } catch (error) {
    const serialized = serializeError(error);
    pushDiagnostic("error", "Failed to read selection.", serialized);
    postUIMessage({
      type: "PLUGIN_ERROR",
      message: serialized.message,
      error: serialized
    });
  }
});

figma.ui.onmessage = async (message) => {
  try {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "UI_READY") {
      uiReady = true;
      if (bootWatchdog) {
        clearTimeout(bootWatchdog);
      }

      sendDiagnosticSnapshot();
      sendSelectionToUI();
      await sendPersistedSettings();
      return;
    }

    if (message.type === "REQUEST_SELECTION") {
      sendSelectionToUI();
      return;
    }

    if (message.type === "REQUEST_DIAGNOSTICS") {
      sendDiagnosticSnapshot();
      return;
    }

    if (message.type === "CLEAR_DIAGNOSTICS") {
      diagnostics.length = 0;
      sendDiagnosticSnapshot();
      return;
    }

    if (message.type === "REQUEST_SETTINGS") {
      await sendPersistedSettings();
      return;
    }

    if (message.type === "SAVE_SETTINGS") {
      await savePersistedSettings(message.settings);
      return;
    }

    if (message.type === "APPLY_COPY") {
      const updates = Array.isArray(message.updates) ? message.updates : [];
      const result = await applyCopyUpdates(updates);

      postUIMessage({
        type: "APPLY_RESULT",
        applied: result.applied,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
        undoAvailable: result.undoAvailable
      });

      sendSelectionToUI();
      return;
    }

    if (message.type === "UNDO_LAST") {
      const result = await undoLastApply();

      postUIMessage({
        type: "UNDO_RESULT",
        restored: result.restored,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors,
        undoAvailable: result.undoAvailable
      });

      sendSelectionToUI();
      return;
    }

    if (message.type === "NOTIFY" && typeof message.message === "string") {
      figma.notify(message.message);
      return;
    }

    if (message.type === "CLOSE_PLUGIN") {
      figma.closePlugin();
      return;
    }

    pushDiagnostic("warn", "Received unknown message type.", {
      type: message.type || "unknown"
    });
  } catch (error) {
    const serialized = serializeError(error);
    pushDiagnostic("error", "Unexpected plugin runtime error.", serialized);
    postUIMessage({
      type: "PLUGIN_ERROR",
      message: serialized.message,
      error: serialized
    });
    figma.notify("Nothing Copywriter plugin error: " + serialized.message);
  }
};

pushDiagnostic("info", "Plugin initialized.", {
  pageName: figma.currentPage.name,
  version: APP_VERSION
});
sendSelectionToUI();
postUIMessage({
  type: "APP_META",
  version: APP_VERSION
});
startBootWatchdog();
