# Releasing Contractual

Releases require Omer's explicit approval. Fixes and merged PRs do not authorize tagging or publishing. The `release` environment requires Omer's approval for release jobs.

## Supported release scope

The first stable scope is OpenAPI 3.0/3.1 and JSON Schema linting and diffing, changesets, independent versioning, and the GitHub Action. AsyncAPI and ODCS can be tracked and versioned but need explicit custom lint/diff commands or disabled checks. They have no built-in governance engines. Fixed versioning, AI features, and generation hooks are not implemented; do not advertise them as stable functionality.

## Prepare a reviewed release

1. Run all checks in [CONTRIBUTING.md](CONTRIBUTING.md).
2. Present Omer with the exact commit, proposed package versions, npm distribution tag, and validation results. Obtain approval before preparing version changes or running a release workflow.
3. Run **Prepare Release** from `next`. It opens a version PR targeting `next`; it does not create tags or publish. Review and merge that PR normally.
4. Obtain approval for the exact merged release commit, then run **Publish Packages** with that full commit SHA and the approved distribution tag. `latest` rejects prerelease versions. Approve the `release` environment job in GitHub.
5. Verify package installations and imports from npm. Update the Action's pinned dependencies, rebuild its committed bundle, and review the Action PR before requesting approval for an Action tag or GitHub Release.

Tag creation is separate and manual. Do not move existing development tags or publish a stable major alias without approval. The old `next → master` PR is historical and is not a prerequisite for releasing from `next`.

## Publishing failures

The June 18 attempt left CLI `0.1.0-dev.8` and changesets `0.1.0-dev.6` tagged but unpublished. The last npm CLI release is `0.1.0-dev.7` under `dev`; `latest` still points to `0.1.0-dev.0`. Do not repair these registry tags without approval.

Publishing preflight checks authentication, package write access, repository metadata, and version/tag compatibility before running Lerna. If npm returns `E404`, verify the configured `NPM_TOKEN` can write every `@contractual` package and that npm access and provenance match `codotech/contractual`. Never print a token in logs. A successful build is not evidence of npm authorization.
