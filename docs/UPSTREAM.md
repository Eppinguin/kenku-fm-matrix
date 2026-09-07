# Tracking upstream Kenku FM

Keep two remotes:

```bash
git remote -v
# origin   git@github.com:Eppinguin/kenku-fm-matrix.git
# upstream https://github.com/owlbear-rodeo/kenku-fm.git
```

If the checkout currently points directly at upstream:

```bash
git remote rename origin upstream
git remote add origin git@github.com:Eppinguin/kenku-fm-matrix.git
```

Do not push to `upstream`.

## Sync workflow

Use a dedicated integration branch rather than merging an upstream update directly into the releasable branch:

```bash
git fetch upstream --tags
git switch main
git switch -c chore/sync-upstream-<version>
git merge --no-ff upstream/main
```

Resolve conflicts with a bias toward keeping upstream structure intact and reapplying the smallest Matrix-specific changes necessary. Then rerun the Matrix and Discord regression tests before merging the sync branch into `main`.

For public fork history, prefer merge commits for upstream synchronization. Avoid rebasing already-published fork releases; preserving ancestry makes future upstream comparisons substantially easier.

## Release versions

Fork releases use the upstream version plus a prerelease suffix:

```text
1.5.5-matrix.1
1.5.5-matrix.2
1.5.6-matrix.1
```

Git tags should match the package version, for example `v1.5.5-matrix.1`.
