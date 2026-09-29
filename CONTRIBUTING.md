# Contributing to Contractual

All development targets `next`, the schema lifecycle implementation. `master` contains the previous code-generation product.

```sh
git fetch origin
git switch -c fix/describe-the-change origin/next
pnpm install --frozen-lockfile
pnpm build
```

Use Node 22 or newer and pnpm 9.15.4. Before opening a PR, run:

```sh
pnpm lint
pnpm test
pnpm test:e2e
```

These commands validate source and behavior. CI additionally uses the `verify-packages` composite action to pack, install, import, and smoke-test temporary local tarballs. It never publishes or tags. Workflow automation lives in `.github/`, without a separate scripts folder.

## Open a PR to next

Use a Conventional Commit title: `fix(cli): handle missing snapshots`, `feat(differs.core): classify new constraints`, or `docs: clarify supported formats`. Supported types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`. Use `!` before the colon for a breaking change.

One approving review, resolved conversations, an up-to-date branch, and passing `CI` and `PR title` checks are required. PRs are squash merged, with the PR title used as the commit subject.

Scopes must match a workspace package: `cli`, `changesets`, `types`, `governance`, `differs.core`, `differs.json-schema`, or `differs.openapi`. Use `*` for changes across packages or omit the scope for repository-wide changes. The semantic PR action enforces this allowlist; update both its workflow configuration and the repository ruleset when adding or renaming a package.

## Release approval

Normal development never publishes packages or creates version tags. Ask Omer before tagging, publishing, changing npm distribution tags, or dispatching a release workflow. See [RELEASING.md](RELEASING.md) for the release procedure and current support boundary.
