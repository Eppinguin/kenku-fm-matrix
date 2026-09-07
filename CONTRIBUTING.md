# Contributing

This fork exists to maintain Kenku FM with MatrixRTC output while staying reasonably close to upstream Kenku FM.

## Scope

Changes should preferably fall into one of these categories:

- MatrixRTC / LiveKit integration
- regressions caused by the Matrix integration
- compatibility with newer upstream Kenku FM releases
- build/release fixes needed to ship this fork
- small maintainability improvements that reduce long-term fork cost

Avoid unrelated rewrites unless they are necessary for one of the areas above.

## Development

Use a short-lived branch from `main` and keep commits focused. Before proposing or merging a change, test at least:

1. application startup;
2. Discord output regression;
3. Matrix login or restored session;
4. discovery of an already-active Matrix call;
5. joining/leaving a Matrix call;
6. actual audio publication;
7. production packaging with `yarn make` when release/build code changed.

Do not include access tokens, passwords, Matrix OpenID tokens, LiveKit JWTs, or private homeserver details in issues or logs.

## Upstream changes

Sync upstream through a dedicated `chore/sync-upstream-*` branch and test the merge before it reaches `main`. See `docs/UPSTREAM.md`.
