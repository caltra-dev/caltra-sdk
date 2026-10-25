# Repository guidance

## UI work

Before changing the test app or consumer-facing React integration, read the [UI convention entry point](docs/ui/README.md).

Preserve assistant-ui Thread defaults. Before replacing or overriding its default components, indicators, behavior, or styling, explain the specific change and obtain the user's explicit approval. A general request to improve or integrate the demo does not authorize these replacements; an explicit request for the specific change does.

## Sprite development provisioning

- When development, tests, builds, or previews require a native package or tool that the standard Sprite runtime does not provide, add its idempotent installation to `scripts/sprite/provision.sh`. Do not rely on an undocumented, one-off installation in a particular Sprite.
- Keep provisioning noninteractive, pin downloaded binaries when compatibility requires it, support every configured Sprite architecture, and never include credentials.
- Use `npm run sprite -- create` to prepare only the current branch's machine environment. Use `npm run sprite-dev -- up HEAD` when provisioning, services, seed data, or runtime settings changed; `update` deliberately skips machine provisioning.
