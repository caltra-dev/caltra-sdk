# Native Thread SDK Release Implementation Plan

**Goal:** Publish minor SDK updates with CaltraChat wrapping native Thread and upgrade every discovered product consumer.

**Architecture:** Preserve the shared SDK presentation boundary. Publish client 0.14.0, assistant-ui 0.6.0 and react 0.16.0 through the existing trusted-publishing workflow; server 0.9.0 is already published and unchanged. Update Caltra, Piria and xDomu Contractors to those exact versions.

**Tech Stack:** TypeScript, npm workspaces, assistant-ui, GitHub Actions trusted npm publishing, Sprite validation.

## Steps
1. Update SDK workspace versions and internal dependency pins in packages/{client,assistant-ui,react}/package.json and apps/test-app/package.json. Regenerate package-lock.json on the existing native-thread Sprite.
2. Run SDK typechecks, tests and builds on Sprite with tracked source synchronized; inspect package archives including compiled native CSS. Commit version changes.
3. User accepted the native-thread preview and requested merge on 25 October. Delete its Sprite, merge into SDK main, remove the merged worktree, push main, and publish client, assistant-ui and react in dependency order. Verify exact registry versions and integrity before consumer installation.
4. Create isolated .worktrees/sdk-native-thread checkouts from local main in each consumer. Update apps/web/package.json and apps/api/package.json plus root lockfiles. Pin server 0.9.0 where used; leave the separate backend-sdk package unchanged.
5. Preserve consumer-owned chat integrations and check exported props. Run relevant web/API typechecks, tests and web builds on each branch Sprite using the actual published packages. Resolve only migration incompatibilities.
6. Commit consumer updates; validate browser-facing changes through the Chrome extension. Provide previews for required user review before consumer merge/cleanup. Production activation is outside this SDK upgrade request.

## Verification and recovery
Record source commits, published npm metadata and consumer checks. No database migrations or production configuration changes are required. Dependency rollback uses the preceding committed manifests/lockfiles; never reuse a published version.
