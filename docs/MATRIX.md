# MatrixRTC output

Kenku FM Matrix publishes Kenku's existing mixed audio output into MatrixRTC calls through LiveKit. Discord output remains available and is independent of Matrix output.

## Sign in

Open Settings → Matrix and enter your homeserver. The available login methods are discovered from the homeserver.

Supported methods:

- password login;
- SSO in the system browser;
- access-token login under Advanced.

Passwords are not stored. The resulting Matrix access token is persisted only when Electron reports secure OS-backed `safeStorage`. Linux environments where `safeStorage` falls back to `basic_text` do not persist the token in plaintext.

## Joining a call

Matrix calls are attached to ordinary Matrix rooms. Kenku therefore shows a Matrix room only while the room has at least one active MatrixRTC participant.

1. Start or join the call from a Matrix client such as Element.
2. Open Kenku's Output list.
3. Select the active Matrix call.
4. Kenku joins the MatrixRTC session and publishes its mixed audio track.

Calls that were already active before Kenku started are discovered after initial Matrix sync completes.

## Multiple outputs

With Multiple Outputs enabled, Kenku can output to local playback, Discord, and Matrix simultaneously. The Matrix integration supports one Matrix call at a time.

## Identity

Kenku participates using the Matrix account that is signed into Kenku. A separate Matrix device is created for Kenku. Device identity is not a separate call persona; other participants will normally see the Matrix user's room profile.

## Technical notes

- Matrix signaling, membership, sync, and encryption keys: `matrix-js-sdk`
- media transport: `livekit-client`
- MatrixRTC slot: `m.call#ROOM`
- audio source: Kenku's existing 48 kHz stereo Web Audio mix
- published track source: microphone, track name `Kenku FM`

The Matrix and LiveKit dependencies are pinned because the MatrixRTC APIs used by this fork are still evolving.
