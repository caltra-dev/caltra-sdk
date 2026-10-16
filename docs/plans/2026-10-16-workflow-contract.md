# SDK Workflow Contract Implementation Plan

**Goal:** Validate pull requests while keeping all pushes silent and preserving explicit manual npm publication.

**Architecture:** A separate PR workflow owns routine checks. The existing `publish.yml` remains the only publication entry point, selected manually per package, and retains its explicit validation. This library repository has no production deployment manifest, Terraform, backend runtime secret delivery, or mobile release units.

**Tech Stack:** GitHub Actions, Node.js 24, npm 11.19.0, existing Vitest and Meldkit dependencies.

## Implementation

1. Add `packages/dev-tools/tests/workflows.test.ts` to parse every workflow and enforce the event contract, unfiltered PR updates, read-only validation permissions, cancellation, and the existing manual package choices and checks. Verify the tests fail before adding the PR workflow.
2. Add `.github/workflows/validate.yml` with `pull_request` events, a stable `validate` job, per-PR cancellation, immutable action references, locked installation, typechecking, tests, and builds. Preserve `publish.yml` unchanged.
3. Document the event matrix and separate live required-check setup in `docs/workflows.md`; link it from `README.md`.
4. Transfer the exact tracked candidate to the branch Sprite. Run the contract tests, typechecks, complete test suite, and build there. Verify tracked source hashes match before and after validation. Do not publish or mutate production as a test.
5. Review the diff, commit, fast-forward clean local `main`, delete the owned Sprite, then remove the worktree and branch. Do not push or change GitHub protection settings.

## Event matrix

PR creation, reopening, and updates run validation without file filters. Source, docs, application lockfile, workflow, native version file, secret, package edits without a bump, version bumps, and mixed pushes start zero push workflows. Package publication is an explicit manual choice. No schedules or dispatch chains are introduced. Production promotion/rollback, Terraform-only releases, mobile release selection, and runtime secret synchronization are not applicable to this SDK.

## Boundaries

No package version changes or forced development version bumps. Existing npm trusted publishing and package selection remain intact. No migrations, runtime activation, preview, or production credentials are needed. Rollback is a Git revert. Operational cost is one cancelable validation run per PR update; GitHub must separately require the new status before merge.
