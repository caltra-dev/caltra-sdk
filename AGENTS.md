# Repository guidance

## Sprite development provisioning

- When development, tests, builds, or previews require a native package or tool that the standard Sprite runtime does not provide, add its idempotent installation to `scripts/sprite/provision.sh`. Do not rely on an undocumented, one-off installation in a particular Sprite.
- Keep provisioning noninteractive, pin downloaded binaries when compatibility requires it, support every configured Sprite architecture, and never include credentials.
- Use `npm run sprite -- create` to prepare only the current branch's machine environment. Use `npm run sprite-dev -- up HEAD` when provisioning, services, seed data, or runtime settings changed; `update` deliberately skips machine provisioning.
