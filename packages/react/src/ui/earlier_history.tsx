import { ThreadPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CaltraSessionRuntime } from "@caltra/client";
import { Button } from "./upstream/components/ui/button.js";
import { Skeleton } from "./upstream/components/ui/skeleton.js";
import type { CaltraChatLabels } from "./labels.js";

/** Loads history through the native runtime so its viewport retains the reading position. */
export function EarlierHistory({ session, labels }: { session: CaltraSessionRuntime; labels: CaltraChatLabels }) {
  const aui = useAui();
  const loading = useAuiState(s => s.thread.isLoadingEarlier);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const sentinel = useRef<HTMLDivElement>(null);
  const automatic = typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    const target = sentinel.current;
    const viewport = target?.closest('[data-slot="aui_thread-viewport"]');
    if (!automatic || !target || !viewport || !snapshot.hasOlderMessages || loading || snapshot.olderError) return;
    let disposed = false;
    const observer = new IntersectionObserver(entries => {
      // A notification already queued at disconnect must not load another session/page.
      const current = session.getSnapshot();
      if (disposed || !entries.some(entry => entry.isIntersecting) || current.loadingOlder || current.olderError || !current.hasOlderMessages) return;
      void aui.thread().loadEarlier();
    }, { root: viewport, rootMargin: "256px 0px 0px 0px" });
    observer.observe(target);
    return () => { disposed = true; observer.disconnect(); };
  }, [aui, automatic, session, snapshot.hasOlderMessages, snapshot.olderError, loading]);

  if (!snapshot.hasOlderMessages && !loading) return null;
  return <div ref={sentinel} data-slot="caltra-earlier-history" className="min-h-px shrink-0" aria-busy={loading}>
    <span role="status" className="sr-only">{loading ? labels.olderLoading : ""}</span>
    {loading && <div aria-hidden="true" className="flex flex-col gap-2 pb-6">
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/5 motion-reduce:animate-none" />
    </div>}
    {(snapshot.olderError || !automatic) && <div className="flex justify-center pb-6">
      <ThreadPrimitive.LoadEarlier asChild>
        <Button variant="ghost" size="sm">{snapshot.olderError ? labels.retry : labels.loadOlder}</Button>
      </ThreadPrimitive.LoadEarlier>
    </div>}
  </div>;
}
