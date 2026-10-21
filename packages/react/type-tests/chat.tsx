// Compile-time public API regression checks; not exported or executed.
import type { CaltraClient, CaltraSessionRuntime } from "@caltra/client";
import type { CaltraChatProps } from "../src/ui/chat.js";
export function checkChatContract(client: CaltraClient, runtime: CaltraSessionRuntime): void {
  const simple: CaltraChatProps = { client, sessionId: "session" };
  const shared: CaltraChatProps = { runtime };
  // @ts-expect-error A supplied runtime and connection options are mutually exclusive.
  const ambiguous: CaltraChatProps = { runtime, client, sessionId: "session" };
  // @ts-expect-error A client requires a session ID.
  const incomplete: CaltraChatProps = { client };
  void [simple, shared, ambiguous, incomplete];
}
