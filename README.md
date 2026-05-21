# Sheet Filtering Tool

Chrome MV3 extension for reviewing an open Google Sheet against selected rule sets.

## What it does

- Shows a popup only when the active tab is a Google Sheet.
- Lets the user select one or more saved filters from a top Filter Selection box.
- Opens as a draggable Google Sheets-native overlay, similar to the Live Comps panel.
- Appears only on Google Sheets pages and can be minimized or closed.
- Lets the user create, save, edit, delete, and re-select named custom filters.
- Edit Filter opens a single-choice overlay so one saved filter is selected for editing.
- Each custom filter can contain multiple filter rules.
- Each filter rule supports:
  - Sport
  - Multiple price ranges
  - PSA, BGS, and SGC allowed checkboxes and grade ranges from 1-10
- Optional synced rule sources can be layered into the custom review:
  - Synced Google Keep rules file
  - Google Sheets rules file URL
- Highlights visible Google Sheets cells red when they do not match the active custom filter.

The Google Keep sync follows the same shape as `live-comps`: open the Keep note once, the Keep content script snapshots the visible note text into extension storage, and the sheet review reads that cached note.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `C:\Users\User\Documents\Codex\2026-05-21\automatic-sheet-review\extension`.
5. Open a Google Sheet.
6. The Sheet Review panel appears on the Google Sheet. Click the extension icon to re-open it if closed.
7. Choose one or more saved filters from Filter Selection, or use Make New Filter in Custom Filter.
8. Click Review Sheet.

## Development check

From this folder:

```powershell
npm run check
```

## Google Keep Rule Format

The extension can optionally read text from an open Google Keep tab. Saved custom filters are the main workflow, but Keep text can still be synced as an additional rule source. Put the note in this shape:

```text
[Custom]
football $100-$250
football $350-$500
exclude: damaged
```

JSON is also supported:

```json
{
  "custom": {
    "rules": [
      {
        "sport": "football",
        "priceRanges": [
          { "min": 100, "max": 250 },
          { "min": 350, "max": 500 }
        ],
        "grades": {
          "psa": { "min": 9, "max": 10 },
          "bgs": { "min": 9.5, "max": 10 },
          "sgc": { "min": 9, "max": 10 }
        }
      }
    ]
  }
}
```

## Current limitation

Google Sheets virtualizes the grid DOM, so this first version reviews and highlights the cells currently rendered in the sheet viewport. As the next hardening pass, wire this to the Google Sheets API or an Apps Script endpoint if you need full-sheet review across hidden/unrendered rows.
