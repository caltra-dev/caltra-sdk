# SDK validation and publication

`validate.yml` runs the stable `validate` job when a pull request is opened,
updated, or reopened. There are no branch or path filters: docs, lockfiles,
workflows, and source changes all receive a check. Superseded runs for the same
PR are canceled. Validation installs the committed lockfile, typechecks, tests,
and builds with Node.js 24 and npm 11.19.0. It has read-only repository access
and no publishing or runtime-secret credentials.

`publish.yml` remains an explicit manual operation. Select `server`, `client`,
`assistant-ui`, or `react` in **Publish SDK packages**. It retains its explicit typechecks,
tests, and build before publishing only the selected package through npm
trusted publishing. Prepare an increasing, unpublished package version for a
release; npm does not permit replacing an already published name/version.
Ordinary development does not require a version bump.

A successful npm publication can precede registry availability. Verify both exact-version metadata and its downloadable tarball, with integrity matching the tested artifact, before upgrading consumers. The 2026-10-21 React release took approximately ten minutes to become installable; do not repeat an accepted publication while npm processes it.

| Event or input | Result |
| --- | --- |
| PR creation, update, reopening | `validate` checks the candidate |
| Source, docs, application lockfile, workflow, or secret-only push | Zero push-event workflow runs |
| Root/workspace package edit without a bump | Zero push-event workflow runs; no publication |
| Package version bump or mixed push | Zero push-event workflow runs; publication still requires manual selection |
| Tag push, native-version-file-only push | Zero push-event workflow runs |
| Explicit manual publication | Validate, build, and publish the selected SDK package |
| Schedule or downstream workflow chain | None configured |

The SDK has no deployable service, production-selection YAML, Terraform
infrastructure, mobile application, or backend runtime-secret synchronization.
Artifact promotion/rollback, infrastructure apply, and deployment-owned secret
delivery therefore do not apply here. Do not add automatic deployment or secret
synchronization merely because a package version or encrypted file changes.

Repository contract tests parse every workflow and enforce these entry points,
the PR check's permissions and cancellation, and the manual package choices.
The [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
defines event subscriptions independently of job conditions; omitting `push`
ensures silent pushes rather than skipped jobs.

## Live repository settings

After this workflow is pushed and first reports its status, configure the
default branch protection/ruleset to require `validate` before merge. That is a
separate administrator operation; changing the workflow does not update live
GitHub protections. Keep the existing per-package npm trusted-publisher
relationship with `publish.yml`. No new publishing credential is needed.

On 2026-10-21, `@caltra/assistant-ui` 0.1.0 was first published interactively, then its package-specific GitHub trusted publisher was created for `caltra-dev/caltra-sdk` and `publish.yml`. Client 0.10.0 and React 0.11.0 were published through that workflow. All three registry integrities matched the prepublication artifacts.

## Runtime capability rollout order

Deploy and verify the Caltra API/worker before activating browser consumers of client 0.10.0. The client sends `x-caltra-session-run-state`; the API must allow it in CORS as well as implement the metadata capability. On 2026-10-21, activating Piria before Caltra completed its ECS rollout temporarily prevented the chat from connecting because the old API omitted this header from `Access-Control-Allow-Headers`. A missing-field runtime fallback does not bypass browser CORS. Verify an OPTIONS request from the consumer origin before activation.
