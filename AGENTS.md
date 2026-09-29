# Repository workflow

- Start feature/fix branches from the latest `origin/next`; open PRs targeting `next`.
- Use Conventional Commit PR titles and commits, for example `fix(cli): handle missing snapshots`.
- Squash merge only after required CI and review. Never bypass the ruleset or push directly to `next`.
- Run `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm pack:check` for release-related changes.
- Always ask Omer for explicit approval before creating, moving, or pushing any version tag; publishing packages or GitHub Releases; changing npm distribution tags; or dispatching a workflow that performs those actions. Approval to fix code or open a PR does not authorize a release.
- Do not change package versions unless a release preparation was explicitly requested. Preserve existing untracked `docs/` material.
