# Releasing Contractual

Releases require Omer's explicit approval. Fixes and merged PRs do not authorize tagging or publishing. The `release` environment requires Omer's approval for release jobs.

## Supported release scope

The first stable scope is OpenAPI 3.0/3.1 and JSON Schema linting and diffing, changesets, independent versioning, and the GitHub Action. AsyncAPI and ODCS can be tracked and versioned but need explicit custom lint/diff commands or disabled checks. They have no built-in governance engines. Fixed versioning, AI features, and generation hooks are not implemented; do not advertise them as stable functionality.

## Prepare a reviewed release

1. Run all checks in [CONTRIBUTING.md](CONTRIBUTING.md).
2. Present Omer with the exact commit, proposed package versions, npm distribution tag, and validation results. Obtain approval before preparing version changes or running a release workflow.
3. Run **Prepare Release** from `next`. It opens a version PR targeting `next`; it does not create tags or publish. Review and merge that PR normally.
4. Obtain approval for the exact merged release commit, then run **Publish Packages** with that full commit SHA. The workflow publishes prereleases to `beta`. Approve the `release` environment job in GitHub.
5. Verify package installations and imports from npm. Update the Action's pinned dependencies, rebuild its committed bundle, and review the Action PR before requesting approval for an Action tag or GitHub Release.

Tag creation uses the separately approved workflow below. Do not move existing tags or publish a stable major alias without approval. The old `next → master` PR is historical and is not a prerequisite for releasing from `next`.

## Sign all package tags

Run **Sign and Push Release Tags** (`tag-global.yml`) on `next` after Omer approves the exact release commit and tag names. Supply the full `commit` SHA. Optionally supply a global beta `tag_name`, such as `v0.1.0-beta.3`.

Lerna lists all public packages and runs the signing command for each missing `<package-name>@<package-version>` tag. The workflow also signs the optional global tag. It verifies every new signature and pushes the new tags atomically. It does not change versions or commits, publish npm packages, or create GitHub Releases. It uses `lerna list` and `lerna exec`; `lerna version --sign-git-tag` would also change package versions and create a new commit.

Existing tags remain immutable, including their signatures. An independent package may keep its older tag if that tag points to an ancestor of the approved commit and the package directory is unchanged. A changed package with an existing version fails with a request to prepare a new version. An existing global tag must point to the exact approved commit. The run summary lists newly signed tags and preserved tags separately. Re-running a completed batch creates no additional tags.

Historical unsigned tags are not converted into signed tags. Package versions and tags are independent: a CLI release can advance to `0.1.0-beta.2` while `types` retains `0.1.0-beta.1` and its original tag.

## Publish independent versions

**Prepare Release** uses Lerna's independent versioning to update changed packages and affected dependents. **Sign and Push Release Tags** tags the versions recorded in the reviewed commit. **Publish Packages** uses `lerna publish from-package` to publish versions missing from npm. A global tag is an optional repository milestone; it does not set every package's version.

The publish preflight checks each package separately:

- An existing package tag may point to an older ancestor commit if that package directory is unchanged.
- An existing npm version is preserved if its `gitHead` is an ancestor of the approved commit with identical package contents. Its existing `beta` distribution tag is preserved, even if that tag points to another version or is absent.
- A missing npm version is published from the approved commit under `beta`. Its npm `gitHead` records that publishing commit, which can be newer than an unchanged package's original Git tag.
- Changed contents under an existing version, unrelated source history, missing source metadata, and registry failures stop publication. Only an explicit registry `E404` permits a new publication.

The workflow records these decisions before publishing and verifies each package against its own expected commit and distribution tag afterward. A retry skips versions already published successfully; when all versions exist, the publish step is skipped entirely. No version bumps, tag moves, or distribution-tag repairs happen implicitly.

### Configure signing once

In the GitHub `release` environment, configure:

| Setting | Kind | Value |
| --- | --- | --- |
| `RELEASE_GPG_PRIVATE_KEY` | Secret | ASCII-armored private GPG signing key dedicated to releases, usable without an interactive passphrase |
| `RELEASE_GPG_REVOCATION_CERT` | Secret | Recovery certificate retained for key revocation; not used by the tagging workflow |
| `RELEASE_GPG_FINGERPRINT` | Variable | Full uppercase 40-character fingerprint |
| `RELEASE_GIT_NAME` | Variable | Tagger name matching the chosen signing identity |
| `RELEASE_GIT_EMAIL` | Variable | Verified GitHub email present on the signing key |

Register the public key with the chosen GitHub account so GitHub can verify its signatures. A separate bot account is optional; the workflow runs with its existing `GITHUB_TOKEN`. Keep the private key in the environment secret, never in the repository or workflow inputs. The workflow imports it into a temporary keyring and removes that keyring after the run. Rotate the dedicated key before it expires.

## Publishing failures

The June 18 attempt left CLI `0.1.0-dev.8` and changesets `0.1.0-dev.6` tagged but unpublished. The last npm CLI release is `0.1.0-dev.7` under `dev`; `latest` still points to `0.1.0-dev.0`. Do not repair these registry tags without approval.

Publishing preflight checks OIDC availability, repository metadata, and version/tag compatibility before running Lerna. If npm rejects authentication, verify each package's Trusted Publisher configuration matches `codotech/contractual`, workflow `publish-packages.yml`, and environment `release`. Publishing uses Trusted Publishing rather than `NPM_TOKEN`. A successful build is not evidence of npm authorization.
