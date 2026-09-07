# Releasing

Before tagging a fork release:

1. ensure the working tree is clean;
2. run `yarn install` and commit any intentional `yarn.lock` changes;
3. remove `.webpack` and run `yarn start`;
4. verify local audio output;
5. verify Discord output;
6. verify Matrix session restoration/login;
7. verify an already-running Matrix call is discovered;
8. join the call and confirm remote participants receive Kenku audio;
9. leave/rejoin the call;
10. run `yarn make` and test the packaged application.

Use fork versions such as `1.5.5-matrix.1`. Do not reuse upstream release tags for modified binaries.

When distributing binaries, publish the corresponding source under GPL-3.0 and clearly identify the release as an unofficial modified build.
