# Ephemeral end-to-end encrypted chat

KoalaSync chat is an optional, live-only text channel rendered on the selected
streaming tab. It is not a messenger and does not add chat UI to the extension
popup.

## Security boundary

- The relay receives ciphertext only and never receives the chat secret.
- The relay stores no messages in RAM or on disk and sends no backlog.
- A late joiner sees only messages sent after joining.
- Room authentication is unchanged. The room password remains separate from the
  chat secret and continues to be sent to the relay during `join_room`.
- Message timing and ciphertext length remain visible to the relay. Same-room
  replay is accepted by the threat model.

## Invite format and key lifecycle

New invitations use a named fragment format:

```text
#j2:r=<roomId>&p=<password>&k=<base64url-secret>[&u=<relayUrl>]
```

The room creator generates 16 random bytes and encodes them as 22 unpadded
base64url characters. URL fragments are not sent in HTTP requests. The website
parses the fragment and passes structured fields through `bridge.js` to the
extension. `chatKey` must never be included in a relay event.

Legacy `#join:` links remain supported and join normally without chat. Manual
room/password entry also joins without chat. The extension clears any prior chat
secret when joining without a key, switching rooms, or leaving.

Deployment order is website first, extension second. An old extension ignores the
additional structured `chatKey` field and continues joining normally.

## Cryptography

- Secret: 16 cryptographically random bytes.
- KDF: HKDF-SHA256 with `roomId` as salt and a fixed KoalaSync chat info label.
- Encryption: AES-256-GCM using WebCrypto.
- IV: fresh random 12-byte value for every message, prepended to the ciphertext.
- AAD: `${roomId}|${senderId}`.
- The derived `CryptoKey` is cached once per active room.

The relay stamps `id`, `senderId`, and `timestamp` on the ciphertext envelope.
Changing `senderId` causes AES-GCM authentication to fail because the receiver uses
the stamped value as AAD.

## Client policy

- Maximum plaintext length: 500 Unicode code points.
- Decrypted text is untrusted. Escape HTML before applying the supported limited
  Markdown formatting.
- No read receipts and no typing indicators.
- The local message DOM is bounded; this is presentation state, not server history.

## Overlay behavior

- Default dock: right.
- Live modes: right, left, and detached.
- Detached mode is draggable and moderately resizable. Size and position are stored
  per origin and clamped to the current viewport.
- The overlay uses a Shadow DOM and never changes host-page layout.
- On `fullscreenchange`, its host moves into `document.fullscreenElement` and remains
  visible.
- It follows all eucalyptus, cyber, and graphite light/dark theme combinations.
- Without a key, the panel stays closed and a disabled chat control explains that a
  current invite link is required.
- Chat display is a local option and defaults to off. Enabling or disabling it never
  deletes the room chat secret, so it can be enabled later without creating a room.
- Without the relay `chat` capability, no chat control is shown.

## Mixed-version rollout

- New extensions announce `chat-v1` in `join_room.clientCapabilities`.
- Old non-chat extensions omit the optional field and receive no `chat_message`
  events. Their playback and room protocol remains unchanged.
- The first chat beta omitted the capability. When it sends one valid v1 chat
  frame, the relay treats that socket as chat-capable for the rest of the
  connection.
- New extensions accept the first beta's unversioned server `chat` capability as
  well as `chat-v1`, so a server-first or extension-first rollout degrades safely.

Peer removal and role management are outside chat scope.
