# Sheet Filtering Tool User Setup

This guide is for people who just want to use the extension.

## What You Need

- Google Chrome
- A Google account
- Access to the Google Sheet you want to review
- Optional: a Google Keep note or Google Sheets rules file for synced rules

## Install The Extension

Use either the Chrome Web Store install link provided by the extension owner or install the unpacked extension from the project folder.

For an unpacked install:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the folder that contains `manifest.json`.

Chrome may ask you to approve permissions for Google Sheets. Approve the permissions so the extension can read the open sheet and apply fill colors.

## Open The Tool

1. Open the Google Sheet you want to review.
2. Click the Sheet Filtering Tool extension icon in Chrome.
3. The panel opens on the sheet.

The tool only runs on Google Sheets pages and does not open automatically on every sheet.

## Default Filters

New installs include:

- `ARENA CLUB FILTER`
- `BGS FILTER`
- `COURT YARD FILTER`
- `GRADED GRAILS FILTER`
- `PSA FILTER`

The Arena Club, Court Yard, and Graded Grails filters are templates. Users must connect their own Google Keep note or Google Sheets rules file before using those filters.

## Use Google Keep Rules

1. Select a Keep-backed filter, such as `COURT YARD FILTER`.
2. Check `Make Custom Filter`.
3. Set `Sync Rules Source` to `Google Keep rules file`.
4. Click `Open Keep Rule Note`.
5. Open the note that contains your rules.
6. Click `Sync Rules` in the Keep page panel.
7. Return to the Google Sheet.
8. Save the filter.

After that, each time you run `Review Sheet` with that saved filter, the extension rechecks the linked Keep note for updated rules.

## Use Google Sheets Rules

1. Select or create a Sheet-backed filter.
2. Check `Make Custom Filter`.
3. Set `Sync Rules Source` to `Google Sheets rules file`.
4. Paste the Google Sheets rules file URL.
5. Save the filter.

Each time you run `Review Sheet` with that saved filter, the extension rereads the linked rules spreadsheet.

## Review A Sheet

1. Open the sheet tab you want to review.
2. Click the extension icon if the panel is closed.
3. Select a saved filter.
4. Click `Review Sheet`.

The extension will:

- clear prior colors applied by the extension
- read the active sheet
- compare each row to the selected filter rules
- highlight accepted rows green
- highlight duplicate accepted rows yellow

## If Nothing Highlights

Check these first:

- Make sure a saved filter is selected.
- Make sure the rule source shows rules found.
- Make sure the Keep note or Google Sheets rules file is accessible.
- Make sure you approved Google Sheets permissions.
- Make sure the card rows include enough description and price information.

If the tool says `0 rules found`, the connected Keep note or rules sheet was readable, but the extension could not identify usable filter rules from it.

## Normal Permissions

The extension needs permission to work with Google Sheets so it can apply row fill colors. Users should not need API keys, OAuth client IDs, or code changes when using a properly published version.

