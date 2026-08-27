# Caltra SDK npm Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish secure, installable `@caltra/client@0.1.0` and `@caltra/react@0.1.0` packages and establish token-free future releases.

**Architecture:** Each workspace package publishes compiled ESM and declarations from `dist`, with public access and repository metadata fixed in its manifest. A manually dispatched GitHub Actions workflow validates the monorepo and publishes Client before React using npm trusted publishing.

**Tech Stack:** TypeScript 5.9, npm workspaces, npm 11, GitHub Actions OIDC, npm trusted publishing

---

### Task 1: Complete package publication metadata

**Files:**
- Modify: `packages/client/package.json`
- Create: `packages/client/README.md`
- Create: `packages/client/LICENSE`
- Modify: `packages/react/package.json`
- Create: `packages/react/README.md`
- Create: `packages/react/LICENSE`

**Step 1: Add public registry and repository metadata**

Add the matching directory-specific repository metadata, homepage, bugs URL, and public npm configuration to each manifest:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/caltra-dev/caltra-sdk.git",
  "directory": "packages/client"
},
"homepage": "https://github.com/caltra-dev/caltra-sdk#readme",
"bugs": {
  "url": "https://github.com/caltra-dev/caltra-sdk/issues"
},
"publishConfig": {
  "access": "public",
  "registry": "https://registry.npmjs.org"
}
```

Use `packages/react` for the React package's repository directory.

**Step 2: Add package-local documentation and license files**

Document installation, the exported entry point, supported runtime expectations, and the relationship between the two packages. Copy the repository's MIT license into both package roots so npm includes it in each tarball.

**Step 3: Build and inspect both package archives**

Run:

```bash
npm run build
npm pack --dry-run --json --workspace=@caltra/client
npm pack --dry-run --json --workspace=@caltra/react
```

Expected: both archives contain their README, LICENSE, package manifest, compiled JavaScript, source maps, declarations, and declaration maps; neither archive contains `src`, tests, application files, environment files, or credentials.

**Step 4: Commit**

```bash
git add packages/client/package.json packages/client/README.md packages/client/LICENSE \
  packages/react/package.json packages/react/README.md packages/react/LICENSE
git commit -m "chore: prepare SDK packages for npm"
```

### Task 2: Add the trusted publishing workflow

**Files:**
- Create: `.github/workflows/publish.yml`

**Step 1: Add an explicit release workflow**

Create a manually dispatched workflow that uses a GitHub-hosted runner, Node 24, npm's public registry, and OIDC:

```yaml
name: Publish SDK packages

on:
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: https://registry.npmjs.org
          package-manager-cache: false
      - name: Use the repository npm version
        run: npm install --global npm@11.19.0
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - run: npm publish --workspace=@caltra/client
      - run: npm publish --workspace=@caltra/react
```

Do not configure or reference an npm token.

**Step 2: Verify workflow and repository state**

Run:

```bash
git diff --check
npm run typecheck
npm test
npm run build
```

Expected: no whitespace errors and all checks pass.

**Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add trusted npm publishing"
```

### Task 3: Publish and configure trust

**Files:**
- No source files changed

**Step 1: Merge the verified release commits into local `main`**

Merge the worktree branch without rewriting existing commits and remove the isolated worktree after confirming `main` contains the release configuration.

**Step 2: Authenticate npm interactively**

Run `npm login` in the SDK repository and complete the browser/security-key flow as `companyhelm`. Verify with `npm whoami`.

**Step 3: Perform the first releases in dependency order**

Run:

```bash
npm publish --workspace=@caltra/client
npm view @caltra/client@0.1.0 version --json
npm publish --workspace=@caltra/react
npm view @caltra/react@0.1.0 version --json
```

Expected: each lookup returns `"0.1.0"`. Stop before the React publish if the Client publish or lookup fails.

**Step 4: Configure trusted publishers**

On each npm package, authorize GitHub Actions for organization `caltra-dev`, repository `caltra-sdk`, workflow `publish.yml`, and the `npm publish` action. Keep traditional account tokens out of the workflow.

**Step 5: Final audit**

Verify both npm package pages show version `0.1.0`, public visibility, and the trusted GitHub Actions publisher. Confirm the Git worktree is clean and all release commits are present on local `main`.
