# Sheet Filtering Tool User Setup

This guide is for people who just want to use the extension.

## What You Need

- Google Chrome
- A Google account
- Access to the Google Sheet you want to review
- Optional: a Google Keep note or Google Sheets rules file for synced rules

## Install The Extension

Use the Chrome Web Store install link provided by the Sheet Filtering Tool owner.

After installing, Chrome may ask you to approve permissions for Google Sheets. Approve the permissions so the extension can read the open sheet and apply fill colors.

## Open The Tool

1. Open the Google Sheet you want to review.
2. The Sheet Review panel should appear on the right side of the sheet.
3. If it is closed or minimized, click the Sheet Filtering Tool extension icon in Chrome.

The tool only appears on Google Sheets pages.

## Select A Filter

1. Use the Filter Selection dropdown.
2. Choose the saved filter you want to run. New installs include default filters for Arena Club, BGS, Graded Grails, and PSA.
3. If the filter uses Google Keep or a Google Sheets rules file, the tool will refresh those rules when you press Review Sheet.

The tool will show how many rules were found from the connected source.

## Use Google Keep Rules

1. Check Make Custom Filter.
2. Set Sync Rules Source to Google Keep rules file.
3. Click Open Keep Rule Note.
4. Open the note that contains the rules.
5. Click Sync Rules in the Keep page panel if needed.
6. Return to the Google Sheet.
7. Save the filter.

After that, each time you run Review Sheet with that saved filter, the extension rechecks the open Keep note for updated rules.

## Use Google Sheets Rules

1. Check Make Custom Filter.
2. Set Sync Rules Source to Google Sheets rules file.
3. Paste the Google Sheets rules file URL.
4. Save the filter.

Each time you run Review Sheet with that saved filter, the extension rereads the linked rules spreadsheet.

## Review A Sheet

1. Open the sheet tab you want to review.
2. Select a saved filter.
3. Click Review Sheet.

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

The extension needs permission to work with Google Sheets so it can apply row fill colors. Users do not need API keys, OAuth client IDs, or developer setup when installing the published version.
