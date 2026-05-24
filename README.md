# Sheet Filtering Tool

Chrome extension for reviewing an open Google Sheet against saved card buying/filter rules.

The extension reads rows from the active Google Sheet, compares each row against the selected saved filter, and fills accepted rows green. Duplicate accepted rows are marked yellow.

## Install From GitHub

1. Download this repository from GitHub.
   - Click `Code`.
   - Click `Download ZIP`.
   - Unzip the folder.

2. Open Chrome and go to:

```text
chrome://extensions
```

3. Turn on `Developer mode`.

4. Click `Load unpacked`.

5. Select the unzipped `Sheet Filtering Tool` folder.

The selected folder must contain `manifest.json`.

## Open The Tool

1. Open a Google Sheet.
2. Click the Sheet Filtering Tool extension icon in Chrome.
3. The tool opens as a movable panel on the sheet.

The panel does not open automatically on every sheet. It only opens when you click the extension icon.

## Default Filters

New installs include five default filters:

- `ARENA CLUB FILTER`
- `BGS FILTER`
- `COURT YARD FILTER`
- `GRADED GRAILS FILTER`
- `PSA FILTER`

The external-source defaults are templates only:

- `ARENA CLUB FILTER` uses a Google Sheets rules file, but ships with no sheet URL.
- `GRADED GRAILS FILTER` uses a Google Sheets rules file, but ships with no sheet URL.
- `COURT YARD FILTER` uses Google Keep, but ships with no Keep note link.

Each user must connect their own Google Keep note or Google Sheets rules file. No private rule files are bundled.

`BGS FILTER` and `PSA FILTER` are native extension filters and can be used without linking an external rules file.

## Connect A Google Keep Filter

1. Open a Google Sheet.
2. Click the extension icon.
3. Select the Keep-backed filter, such as `COURT YARD FILTER`.
4. Click `Make Custom Filter`.
5. Set `Sync Rules Source` to `Google Keep rules file`.
6. Click `Open Keep Rule Note`.
7. Open the Keep note that contains the rules.
8. Click `Sync Rules` in the small Sheet Filtering Tool panel on the Keep page.
9. Return to the Google Sheet.
10. Save the filter.

After that, `Review Sheet` will re-check that linked Keep note before reviewing. If the Keep note cannot be read completely, the review stops before coloring rows.

## Connect A Google Sheets Rules File

1. Open a Google Sheet.
2. Click the extension icon.
3. Select or create a Sheet-backed filter.
4. Click `Make Custom Filter`.
5. Set `Sync Rules Source` to `Google Sheets rules file`.
6. Paste the rules spreadsheet URL.
7. Save the filter.

Each time `Review Sheet` runs, the extension rereads the linked rules spreadsheet.

## Review A Sheet

1. Open the sheet you want to review.
2. Click the extension icon if the panel is closed.
3. Select one saved filter.
4. Click `Review Sheet`.

The extension will:

- clear prior colors applied by the extension
- refresh the linked Keep note or rules spreadsheet if the filter uses one
- parse card rows from the active sheet
- fill accepted rows green
- fill duplicate accepted rows yellow

## Permissions

The extension uses Google Sheets access so it can apply actual fill colors to the sheet. Users do not need to create API keys or edit code.

When installed as an unpacked developer extension, Google OAuth setup may still depend on the configured OAuth client and tester access. For general distribution, publish through the Chrome Web Store with a verified OAuth consent screen.

## Developer Commands

Run checks:

```powershell
npm run check
```

Build the Chrome upload ZIP:

```powershell
npm run package
```

The ZIP is created at:

```text
dist/sheet-filtering-tool.zip
```

