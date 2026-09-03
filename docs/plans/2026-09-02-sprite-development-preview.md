# Sprite Development Preview Implementation Plan

**Goal:** Provide a single repository-owned command that deploys an exact committed revision into a private, resumable remote development environment without consuming laptop CPU.

## Design

- Keep provider, resource, URL, lifecycle, port, and runtime choices in `dev-tools.yaml`.
- Keep orchestration in the non-admin `packages/dev-tools` workspace.
- Transfer source as a temporary Git bundle so the Sprite never receives GitHub credentials.
- Read the shared restricted provider token from `.env.dev-tools.gitvaulty` only at the process boundary.
- Derive names from both repository and branch to prevent collisions under the shared token prefix.
- Use organization-user URL authentication and bridge application bearer auth through the internal gateway where required.
- Let the platform suspend idle Sprites; preserve the workspace and local data services across wake-ups.

## Verification

- Unit-test strict configuration, exact-revision bundle transfer, naming, service definitions, lifecycle management, and error redaction.
- Typecheck the developer-tools package and any changed web authentication/configuration boundary.
- Run the repository command against the provider and verify the authenticated preview when practical.
