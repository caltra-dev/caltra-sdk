# Caltra SDK test app Sprite development preview

The repository-level `npm run sprite-dev` command sends the exact committed revision in a temporary Git bundle and starts the Vite test app and its server-side SDK configuration inside a private Fly Sprite. Working-tree changes and Git credentials are never transferred.

The command reads `SPRITES_API_TOKEN` and any application-only preview settings from the encrypted `.env.dev-tools.gitvaulty` profile. GitVaulty materializes plaintext only for the command lifetime. The Sprite URL uses Sprites organization-user authentication.

```sh
npm run sprite-dev
npm run sprite-dev -- up <revision>
npm run sprite-dev -- status
npm run sprite-dev -- list
npm run sprite-dev -- list --all
npm run sprite-dev -- delete [name-or-id]
npm run sprite-dev -- prune --older-than 7d
```

Names are stable per repository and branch under the shared `local-dev-tools` token prefix, so repositories cannot collide on `main`. Sprites owns idle suspension and wake-up. The workspace survives warm suspension and cold boot; the managed Vite service is recreated automatically after a cold boot. Use `delete` or `prune` to remove retained storage.
