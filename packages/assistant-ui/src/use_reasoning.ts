"use client";

import type { CaltraSessionRuntime } from "@caltra/client";
import { useEffect, useMemo, useSyncExternalStore } from "react";

/** Connects reasoning only while a consumer's disclosure is open; normal chat is unaffected. */
export function useCaltraReasoning(session: CaltraSessionRuntime, messageId: string, open: boolean) {
  const resource = useMemo(() => session.reasoning(messageId), [session, messageId]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  useEffect(() => {
    if (!open) return;
    void resource.start().catch(() => undefined);
    return () => { void resource.stop(); };
  }, [resource, open]);
  return { ...state, retry: async () => { await resource.stop(); await resource.start().catch(() => undefined); } };
}
