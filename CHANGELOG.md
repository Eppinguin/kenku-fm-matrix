# Changelog

This changelog covers fork-specific changes. Upstream Kenku FM history remains available in the Git history and upstream repository.

## 1.5.5-matrix.1

Initial Matrix-enabled fork release based on Kenku FM 1.5.5.

### Added

- Matrix homeserver login using password, SSO, or advanced access-token entry.
- Secure Matrix session persistence through Electron `safeStorage` when OS-backed secure storage is available.
- MatrixRTC active-call discovery, including calls active before application startup.
- LiveKit publication of Kenku's existing mixed Web Audio output.
- MatrixRTC media E2EE key bridging to LiveKit.
- Matrix outputs alongside the existing local and Discord output paths.

### Behavior

- Only Matrix rooms with an active call are shown in the output list.
- Kenku joins existing calls rather than creating calls.
- One Matrix call can be selected at a time.
