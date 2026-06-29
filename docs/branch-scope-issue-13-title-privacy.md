# Branch Scope: Issue #13 Title Privacy

Temporary planning document for branch `codex/issue-13-title-privacy`.

IMPORTANT: Delete this file before opening the PR. It is only for branch-local coordination and should not be merged.

## Issue

GitHub issue #13 asks for an advanced privacy option that controls whether tab titles and media titles are sent to the KoalaSync relay server.

## Goals

- Keep the existing behavior as the default for full backwards compatibility.
- Add a local-only extension setting for shared title privacy.
- Support three modes:
  - Full titles: current behavior.
  - Episode only: send only an extracted episode identifier such as `S01E04` or `EP004`.
  - Hidden: clear shared tab and media titles before they leave the extension.
- Avoid server changes unless absolutely necessary.
- Preserve local title-based behavior where possible, including local episode detection.

## Compatibility Notes

- Existing users should keep sending full titles unless they actively change the new setting.
- Existing servers already accept omitted, `null`, or string title fields.
- The protocol version should not need to change because this is a client-side reduction of optional payload fields.
- Older clients in the same room will keep behaving as before.

## Implementation Notes

- Centralize outgoing title filtering in `extension/background.js`.
- Store the option in `chrome.storage.local`, not `chrome.storage.sync`.
- Use the existing episode extraction helper logic for episode-only mode.
- In hidden mode, actively send `null` for title fields so stale titles are cleared server-side.
- Episode lobby payloads must not leak full titles when privacy mode is hidden.

## Verification

- Run the existing verification script.
- Add focused tests for title privacy helpers if the code shape allows it.
- Manually inspect the popup settings layout after adding the select control.
