# Host Control Mode

This document describes the Host Control Mode implementation in the relay and
extension. It only covers behavior implemented in the current codebase.

## Modes

### `everyone`

- Default room mode.
- Any peer may send room-moving playback events.

### `host-only`

- Only controllers may send room-moving playback events.
- The host is always a controller.
- The host can promote additional peers to controllers.
- Guests can keep watching locally in solo/desynced mode, but their local actions
  still do not drive the shared room.

Room-moving events are:

- `play`
- `pause`
- `seek`
- `force_sync_prepare`
- `force_sync_execute`
- `episode_lobby`
- `episode_lobby_cancel`

Heartbeats, force-sync ACKs, episode-ready events, ping/pong, and command ACKs
remain allowed for guests.

## Server State

Rooms store Host Control state in memory:

```js
{
  hostPeerId,
  controlMode,
  controllers,
  lastControlModeChangeAt,
  lastRoleChangeAt,
  forceSyncInitiator
}
```

`controllers` is a `Set` on the server and is serialized as an array in
`room_data` and `control_mode`.

State is not persisted across relay restarts.

## Authority Rules

### Changing mode

Only `hostPeerId` may send `set_control_mode`.

Valid values:

- `everyone`
- `host-only`

Invalid values are ignored. Non-host attempts are ignored and the sender receives
the current `control_mode` snapshot so optimistic UI can revert.

Mode changes are debounced per room for 500 ms.

### Promoting and demoting controllers

Only `hostPeerId` may send `set_peer_role`.

The host cannot demote themself. No-op role changes are ignored. Role changes are
debounced per room for 500 ms.

### Host leaving

When the host leaves and peers remain:

- the next peer becomes `hostPeerId`;
- `controlMode` falls back to `everyone`;
- `controllers` is reset to the new host;
- the relay broadcasts `control_mode`.

When a non-host controller leaves, the relay removes that peer from
`controllers` and broadcasts `control_mode`.

## Enforcement

The implementation has two enforcement points:

- The extension background script blocks local guest attempts in `host-only` and
  sends `HOST_BLOCKED` to the content script for local UX.
- The relay drops room-moving events from non-controllers in `host-only`, so old
  or modified clients cannot drive the room.

The relay is the authority for room-wide effects.

## Guest UX

When a guest action is blocked locally, the content script classifies it:

- deliberate user action: show the host-control dialog;
- likely involuntary player action (buffering, tab refocus, no recent gesture):
  silently snap back when safe;
- live/DVR stream: degrade without forcing snap-back.

The dialog offers:

- stay in sync: resync to the host;
- watch on my own: enter solo/desynced mode.

In solo/desynced mode:

- the guest can control their local video;
- host room commands are ignored locally, except force-sync preparation is ACKed
  so the host's flow can continue;
- the guest can resync to the host.

The extension reports `desynced` in peer status so the host UI can show that a
guest is watching solo.

## Force Sync Edge Case

The relay tracks `forceSyncInitiator` after a controller sends
`force_sync_prepare`.

This allows that same initiator's `force_sync_execute` through even if their
controller role changes before execute arrives. Without this, a demotion in the
middle of a force-sync flow could leave peers waiting after prepare.

The relay clears `forceSyncInitiator` after execute or when the initiator leaves.

## Capabilities

The relay advertises Host Control support in `room_data.capabilities`:

- `host-control`
- `co-host`

The extension hides or disables matching UI when capabilities are missing.

## Related Events

See [PROTOCOL.md](PROTOCOL.md) for payloads and relay behavior for:

- `set_control_mode`
- `control_mode`
- `set_peer_role`
- host-only gated relay events
