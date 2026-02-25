# Nothing Copywriter (Figma Plugin)

A plugin for rewriting UI copy across selected Figma screens with consistent style rules.

## What it does

- Reads text layers from selected nodes (typically frames/screens).
- Rewrites copy in one click using OpenAI models.
- Applies updates directly to text layers.
- Supports one-step undo of the last rewrite batch.
- Shows diagnostics inside the plugin (no Figma dev console required).

## Setup

1. Open Figma desktop app.
2. Go to `Plugins -> Development -> Import plugin from manifest...`.
3. Select `manifest.json`.
4. Run `Nothing Copywriter` from `Plugins -> Development`.

## Style Prompt Source

- Preset system prompts are sourced from JSON files in `/styles`.
- Current files:
  - `styles/Generic UX.json`
  - `styles/Nothing-style.json`
- After editing style JSON, regenerate the UI prompt bundle:
  - `node scripts/sync-style-prompts.js`
- The sync script updates:
  - `styles/style-prompts.generated.js` (generated artifact)
  - inline prompt block in `ui.html` used at runtime by Figma

## Usage

1. Select one or more frames/screens in your Figma file.
2. In the plugin UI:
   - add OpenAI API key,
   - model is fixed to `gpt-5.2`,
   - choose style preset (`Generic UX`, `Nothing-style`, or `Custom`),
   - add custom style rules when `Custom` is selected.
3. Click `Rewrite all` to generate suggestions for unique strings.
4. Review/edit text directly inside each card, then click that card’s `Update` button to apply changes.
5. Click `Undo all` to revert plugin-applied changes in this session.

## Notes

- Settings persist across runs (local UI storage + Figma `clientStorage`).
- Text layers with missing fonts cannot be updated until fonts are resolved.
- This plugin uses `https://api.openai.com/v1/responses`.
- Diagnostics are still captured internally for troubleshooting, but the diagnostics panel is hidden in the UI.
