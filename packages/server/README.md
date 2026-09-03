# `@caltra/server`

The server-only Caltra SDK. Keep its API key in trusted backend code and never ship it to a browser.

```ts
import { CaltraServerClient } from "@caltra/server";

const caltra = new CaltraServerClient({ apiKey: config.caltraApiKey });

const workspace = await caltra.workspaces.get({
  externalId: piriaOrganization.id,
  createIfMissing: { name: piriaOrganization.name },
});
```

Without `createIfMissing`, `workspaces.get()` returns `null` when the external ID is unknown. With
`createIfMissing`, concurrent calls converge on the same workspace for the API key's Caltra
organization.
