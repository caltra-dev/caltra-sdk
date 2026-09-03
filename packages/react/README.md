# `@caltra/react`

React adapter that exposes a durable Caltra session as an assistant-ui external-store runtime. It supplies the runtime integration, not presentation components.

## Install

```bash
npm install @caltra/client @caltra/react @assistant-ui/react react react-dom
```

## Use

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useCaltraRuntime } from "@caltra/react";
import type { CaltraClient } from "@caltra/client";

export function CaltraSession(props: { client: CaltraClient; sessionId: string }) {
  const { runtime } = useCaltraRuntime(props);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Render assistant-ui thread components here. */}
    </AssistantRuntimeProvider>
  );
}
```

The package is ESM-only and requires `@caltra/client`. See the [Caltra SDK repository](https://github.com/caltra-dev/caltra-sdk) for a complete local integration application.

Authentication belongs to `@caltra/client`. Supply an `authorizationCodeProvider` backed by the
customer's authenticated server route, then pass the resulting `CaltraClient` to this React adapter.
