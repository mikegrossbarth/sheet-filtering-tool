# Sheet Filtering Tool

Chrome extension for reviewing an open Google Sheet against saved buying/filter rules.

## Best Way To Share It

For other people to use this without creating their own keys, OAuth clients, or Google Cloud projects, publish this extension through the Chrome Web Store.

That gives users the simple path:

1. Install Sheet Filtering Tool from the Chrome Web Store.
2. Open a Google Sheet.
3. Select or create a saved filter.
4. Link a Google Keep note or Google Sheets rules file if needed.
5. Click Review Sheet.

Users should not need to create API keys or edit code. The extension includes the OAuth client in `manifest.json`; once the Chrome Web Store item and Google OAuth consent screen are approved, users only grant the extension access when Chrome asks for it.

## Important Google Limitation

There is no practical way to permanently fill private Google Sheets cells green/yellow without Google authorization. The extension currently uses the Google Sheets API for the actual fill color update, so Chrome/Google must authorize that access.

What we can avoid:

- every user making their own Google Cloud project
- every user pasting a client ID
- every user loading a local developer build
- unverified-app warnings after the production OAuth app is verified

What we cannot avoid for real sheet editing:

- the user must be signed into Google
- the user must install the extension
- the user may need to approve the extension's Sheets permission once

## What It Does

- Appears only on Google Sheets pages.
- Opens as a draggable, minimizable native overlay.
- Lets users create, save, edit, delete, and select saved filters.
- Supports Google Keep-backed and Google Sheets-backed rules.
- Refreshes linked Keep/Sheet rules every time Review Sheet runs.
- Shows a compact synced-source status and parsed rule count.
- Reviews every row from the active sheet export.
- Fills accepted rows green.
- Fills duplicate accepted rows yellow.
- Clears previous extension-applied fills before each review.

## Rule Sources

Saved filters can use:

- manual custom filter rules
- a Google Keep rules note
- a Google Sheets rules workbook

Keep and Sheets sources are treated as live rule files. Review Sheet refreshes the selected source before parsing rules.

## Local Development Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder:

```text
C:\Users\User\Documents\Codex\2026-05-21\automatic-sheet-review\Sheet Filtering Tool
```

5. Open a Google Sheet.
6. The Sheet Review panel appears on the sheet.

Local developer installs are for testing only. For normal users, use the Chrome Web Store route.

## Checks

```powershell
npm run check
```

## Package For Chrome Web Store

```powershell
npm run package
```

The ZIP will be created in `dist/`.

## Production Setup Checklist

1. Create or use the production Chrome Web Store listing.
2. Make sure the extension ID in Chrome Web Store matches the OAuth client configuration in Google Cloud.
3. Configure the OAuth consent screen for the production project.
4. Add the Google Sheets API scope used by the extension:

```text
https://www.googleapis.com/auth/spreadsheets
```

5. Submit the OAuth app for Google verification if required.
6. Upload the packaged ZIP to the Chrome Web Store.
7. Publish to trusted testers or public users.

After this, users install from the store and do not need keys, client IDs, or local setup.
