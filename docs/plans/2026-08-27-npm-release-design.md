# Caltra SDK npm Release Design

## Goal

Publish `@caltra/client` and `@caltra/react` as public npm packages at version `0.1.0`, then move subsequent releases to token-free GitHub trusted publishing.

## Release shape

The first release is interactive because npm only permits a trusted publisher to be configured after a package already exists. Each package will declare public npm access and repository metadata in its manifest. The published tarballs will contain only compiled `dist` output plus npm's automatically included package metadata, README, and license files. The release audit will inspect each tarball before any registry write.

The two packages must be released in dependency order. `@caltra/client@0.1.0` is published first and verified from the public registry. `@caltra/react@0.1.0` is published second because its production dependency resolves the exact client version. Both first publishes use the authenticated `companyhelm` npm account, which owns the `caltra` organization and has publishing 2FA enabled.

## Automation

After both packages exist, a GitHub Actions workflow will publish from the `caltra-dev/caltra-sdk` repository using npm trusted publishing and GitHub OIDC. The workflow will run on a GitHub-hosted runner, request `id-token: write`, install locked dependencies, run typechecking and tests, build both packages, and publish in dependency order. Releases will be explicit rather than triggered by every merge to `main`.

The npm trusted-publisher relationship is configured separately for each package and restricted to the exact workflow filename. No long-lived npm publishing token will be committed or stored as a GitHub secret.

## Verification and failure handling

Before publication, the repository must pass typechecking, tests, and builds from a clean install. `npm pack --dry-run --json` will verify package names, versions, entry points, files, and absence of secrets or application-only sources. Each registry publish is followed by an exact-version lookup. If the client publish fails, the React publish does not run. If React fails after Client succeeds, Client remains a valid independent release and React can be retried with the unchanged `0.1.0` version only if npm never accepted it.
