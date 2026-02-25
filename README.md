# Nothing Copywriter (Figma Plugin)

A plugin for rewriting UI copy across selected Figma screens with consistent style rules.

## What it does

- Reads text layers from selected nodes (typically frames/screens).
- Rewrites copy in one click using OpenAI models.
- Applies updates directly to text layers.
- Supports one-step undo of the last rewrite batch.
- Shows diagnostics inside the plugin (no Figma dev console required).

## Install from GitHub

1. Open the GitHub repo:
   - [https://github.com/raymondronglezhu/nothing-copywriter](https://github.com/raymondronglezhu/nothing-copywriter)
2. Click the green `Code` button, then click `Download ZIP`.
3. Unzip the downloaded file on your computer.
4. Open the **Figma Desktop App**.
5. In Figma, go to:
   - `Plugins -> Development -> Import plugin from manifest...`
6. In the unzipped folder, select `manifest.json`.
7. Run the plugin:
   - `Plugins -> Development -> Nothing Copywriter`

## First-time setup

1. Open the plugin.
2. Paste your OpenAI API key in `OpenAI API Key`.
3. Choose a style preset (`Generic UX`, `Nothing-style`, or `Custom`).
4. If you choose `Custom`, add your additional rules.

## How to use

1. Select one or more frames/screens in your Figma file.
2. Click `Rewrite all` to generate suggestions for unique strings.
3. Review or edit text directly in each card.
4. Click `Update` on a card to apply that change to your design.
5. Click `Undo all` if you want to revert plugin-applied changes in this session.

## Optional: Editing style prompts (advanced)

- Preset prompts live in:
  - `styles/Generic UX.json`
  - `styles/Nothing-style.json`
- After editing those files, run:
  - `node scripts/sync-style-prompts.js`
- This refreshes prompt data used by the plugin UI.

## Notes

- Settings persist across runs (local UI storage + Figma `clientStorage`).
- Text layers with missing fonts cannot be updated until fonts are resolved.
- This plugin uses `https://api.openai.com/v1/responses`.
- Diagnostics are still captured internally for troubleshooting, but the diagnostics panel is hidden in the UI.
