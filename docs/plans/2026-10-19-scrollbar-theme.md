# Optional scrollbar theme implementation plan

**Goal:** Give SDK consumers a light native chat scrollbar with explicit opt-in and ordinary CSS overrides.

**Architecture:** Export `@caltra/react/scrollbar.css` separately from the headless runtime. Apply low-specificity rules only to `.caltra-scrollbar` or the packaged chat viewport `.caltra-chat__viewport`. Keep native keyboard, pointer and touch scrolling; do not inject styles from JavaScript. Use inherited custom properties and system colors in forced-color mode.

**Tech stack:** CSS, existing TypeScript package build, Playwright browser tests, npm packaging.

## Implementation

1. Add `packages/react/src/scrollbar.css`, export its built asset, copy it during build, and mark CSS side effects so consumer bundlers retain explicit imports.
2. Document opt-in, class scope, theme variables, the standard width keywords, fallback sizing, and accessibility behavior in `packages/react/README.md`.
3. Import the stylesheet in the test app and mark its actual chat viewport. This stays additive to the separate in-progress packaged-chat work.
4. Add browser contract coverage for default scope, inherited/custom styling, ordinary CSS overrides, keyboard scrolling and forced colors. Verify the packed asset and a production build.
5. Run build/typecheck/tests on the task-owned Piria Sprite in a separate SDK checkout, with tracked-source parity. The existing live Piria preview exercises native chat scrolling; update its temporary local styling to the input-border gray.

## Release boundary

The optional stylesheet is unpublished source. Do not claim it is available from npm. Piria's matching local styling remains until a release containing the export is approved and published; then replace it with the package import and product variables. Do not publish packages or merge either preview without user acceptance.

## Validation on 19 October 2026

- Ran in `/home/sprite/scrollbar-sdk` on the task's Piria Sprite, isolated from its application checkout. Node 24.18.0 was already available there and satisfies jsdom 30's Node requirement; the Piria preview's 24.13.0 runtime was not changed.
- React package build/typecheck and all 4 existing runtime tests passed. The test-app production build passed and retained the optional CSS import.
- `npm pack` included `dist/scrollbar.css` and its public export. The tarball is a validation artifact using the current development version, not a new npm publication.
- All 5 new Playwright tests passed: desktop/mobile keyboard scrolling and isolation, inherited tokens, plain CSS overrides (including hover), and forced colors.
- The updated Piria preview at application commit `0219b1d8` was checked in authenticated Chrome using the retained conversation. The idle scrollbar computed color exactly matched `--input` (`oklch(0.82 0.014 255)`); hover was a subtle 12% mix. User-entered messages were preserved.
- Piria continues using its local CSS until a released SDK package provides the optional export. The SDK demo consumes the new export in source. No SDK publication or production deployment was performed.
