<p align="center">
  <img width="100" src="logo.png" alt="Contractual" />
</p>

<h1 align="center">Contractual</h1>

<p align="center">
Schema contract lifecycle for OpenAPI and JSON Schema
<br />
Linting • Breaking change detection • Versioning • Release automation
</p>

<div align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" /></a>
  <a href="https://github.com/codotech/contractual/blob/next/CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome" /></a>
  <a href="https://npmjs.org/package/@contractual/cli"><img src="https://img.shields.io/npm/dm/@contractual/cli.svg?label=%40contractual%2Fcli" alt="npm downloads" /></a>
</div>

<h3 align="center">
  <a href="https://contractual.dev">Docs</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://contractual.dev/getting-started/quickstart">Quickstart</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://contractual.dev/breaking/overview">Breaking Detection</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://contractual.dev/github-action/setup">GitHub Action</a>
</h3>

<p align="center">
<strong>Supported Formats:</strong> <a href="https://www.openapis.org/">OpenAPI</a>, <a href="https://json-schema.org/">JSON Schema</a>
</p>

## Features

- **Structural Breaking Change Detection** - Compares specs against versioned snapshots using structural diffing, not string comparison. Catches removed fields, type changes, and endpoint deletions.

- **Automated Versioning** - Changesets declare bump levels (major/minor/patch). `contractual version` consumes them, bumps versions, updates snapshots, and generates changelogs.

- **CI Integration** - GitHub Action posts diff tables on PRs, auto-generates changesets, and opens Version PRs for release automation.

- **Format Agnostic** - Works with OpenAPI and JSON Schema. Custom linters and differs can be configured per contract.

## Quick Example

### Detect changes

```bash
$ contractual diff

orders-api: 3 changes (2 breaking, 1 non-breaking) — suggested bump: major

  BREAKING     Removed endpoint GET /orders/{id}/details
  BREAKING     Changed type of field 'amount': string → number
  non-breaking Added optional field 'tracking_url'
```

### Generate a changeset

```bash
$ contractual changeset

? Bump type for orders-api: major
? Summary: Remove deprecated endpoint, change amount type

Wrote .contractual/changesets/fuzzy-lion-dances.md
```

### Bump versions

```bash
$ contractual version

orders-api  1.4.2 → 2.0.0 (major)

Updated .contractual/versions.json
Updated CHANGELOG.md
```

## Installation

Development releases are currently available under the npm `dev` tag. There is no stable release yet. Built-in linting and diffing support OpenAPI and JSON Schema; AsyncAPI and ODCS require custom engines. AI, fixed versioning, and generation hooks are planned. See [release scope](RELEASING.md) and [contributing](CONTRIBUTING.md).

```bash
npm install -g @contractual/cli@dev
```

Or with other package managers:

```bash
pnpm add -g @contractual/cli@dev
yarn global add @contractual/cli@dev
```

## Getting Started

1. **Initialize** - `contractual init` scans for specs and creates `contractual.yaml`
2. **Lint** - `contractual lint` validates specs
3. **Detect changes** - `contractual diff` shows all changes classified
4. **CI gate** - `contractual breaking` fails if breaking changes exist
5. **Version** - `contractual changeset` + `contractual version` for releases

[→ Full Quickstart Guide](https://contractual.dev/getting-started/quickstart)

## Community

- [Documentation](https://contractual.dev)
- [GitHub Issues](https://github.com/codotech/contractual/issues)

## License

[MIT](LICENSE)
