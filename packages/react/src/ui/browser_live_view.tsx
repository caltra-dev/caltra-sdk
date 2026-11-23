"use client";
import { CaltraApiError, type CaltraClient } from "@caltra/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./upstream/components/ui/button.js";

/** How often the interactive lease is renewed; comfortably inside the server's lease window. */
const HEARTBEAT_INTERVAL_MS = 20_000;
/**
 * Heartbeat answers that mean the lease is definitively gone: another holder, an ended session, or
 * a profile this user can no longer reach (revoked or deleted). Anything else is retried.
 */
const CONTROL_ENDED_CODES = new Set(["not_controller", "no_active_session", "resource_not_found"]);

export interface BrowserLiveViewLabels {
  title: string;
  loading: string;
  noActiveSession: string;
  refresh: string;
  takeOver: string;
  handBack: string;
  failed: string;
  controlFailed: string;
  controlLost: string;
}

const defaultLabels: BrowserLiveViewLabels = {
  title: "Live browser",
  loading: "Loading live view...",
  noActiveSession: "No browser session is running right now.",
  refresh: "Refresh",
  takeOver: "Take over",
  handBack: "Hand back",
  failed: "The live view could not be loaded.",
  controlFailed: "Could not take over the browser.",
  controlLost: "Control of the browser was lost.",
};

export interface BrowserLiveViewProps {
  client: CaltraClient;
  browserProfileId: string;
  className?: string;
  labels?: Partial<BrowserLiveViewLabels>;
}

type View =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "failed" }
  | { kind: "read_only"; url: string }
  | { kind: "interactive"; url: string };

/**
 * Shows a browser profile's live browser. It starts read-only; "Take over" swaps the iframe to the
 * interactive URL and renews the lease every 20 seconds, and "Hand back" releases it and reloads
 * the read-only URL. Reloading matters on hand-back: the provider keeps an already-open interactive
 * connection alive after its token is revoked, so only navigating the iframe closes it. Control is
 * also released (best effort, keepalive) on unmount and on pagehide.
 */
export function BrowserLiveView(props: BrowserLiveViewProps) {
  // Each (client, profile) pair gets its own instance, so a change releases the old lease against
  // the old id and discards its late responses (they resolve against the unmounted instance).
  const clientVersion = useRef({ client: props.client, version: 0 });
  if (clientVersion.current.client !== props.client) clientVersion.current = { client: props.client, version: clientVersion.current.version + 1 };
  return <BrowserLiveViewInstance key={`${clientVersion.current.version}:${props.browserProfileId}`} {...props} />;
}

function BrowserLiveViewInstance({ client, browserProfileId, className, labels: labelOverrides }: BrowserLiveViewProps) {
  const labels = { ...defaultLabels, ...labelOverrides };
  const [view, setView] = useState<View>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Mirrors "we hold the lease" for the unmount/pagehide handlers, which must not see stale state.
  const holdsControl = useRef(false);
  const mounted = useRef(true);

  const loadReadOnly = useCallback(async () => {
    try {
      const live = await client.browserProfiles.liveView(browserProfileId);
      if (mounted.current) setView({ kind: "read_only", url: live.url });
    } catch (error) {
      if (!mounted.current) return;
      setView(error instanceof CaltraApiError && error.code === "no_active_session" ? { kind: "empty" } : { kind: "failed" });
    }
  }, [client, browserProfileId]);

  const releaseNow = useCallback(() => {
    if (!holdsControl.current) return;
    holdsControl.current = false;
    // Best effort: the lease also lapses on its own if this request never lands.
    void client.browserProfiles.releaseControl(browserProfileId, { keepalive: true }).catch(() => undefined);
  }, [client, browserProfileId]);

  useEffect(() => {
    mounted.current = true;
    void loadReadOnly();
    window.addEventListener("pagehide", releaseNow);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", releaseNow);
      releaseNow();
    };
  }, [loadReadOnly, releaseNow]);

  const interactive = view.kind === "interactive";
  useEffect(() => {
    if (!interactive) return;
    const timer = setInterval(() => {
      void client.browserProfiles.heartbeat(browserProfileId).catch((error: unknown) => {
        // Only a definitive loss ends control; a network blip is retried at the next tick.
        if (!(error instanceof CaltraApiError) || !CONTROL_ENDED_CODES.has(error.code) || !mounted.current) return;
        holdsControl.current = false;
        setNotice(labels.controlLost);
        setView({ kind: "loading" });
        void loadReadOnly();
      });
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [interactive, client, browserProfileId, loadReadOnly, labels.controlLost]);

  const takeOver = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const grant = await client.browserProfiles.takeControl(browserProfileId);
      holdsControl.current = true;
      if (!mounted.current) return releaseNow();
      setView({ kind: "interactive", url: grant.url });
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof CaltraApiError && error.code === "no_active_session") setView({ kind: "empty" });
      else setNotice(labels.controlFailed);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const handBack = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await client.browserProfiles.releaseControl(browserProfileId);
    } catch (error) {
      // not_controller means the lease is already gone, which is the state we want.
      if (!(error instanceof CaltraApiError && error.code === "not_controller")) setNotice(labels.controlFailed);
    }
    if (!mounted.current) return;
    holdsControl.current = false;
    setView({ kind: "loading" });
    await loadReadOnly();
    if (mounted.current) setBusy(false);
  };

  const refresh = () => {
    setView({ kind: "loading" });
    setNotice(null);
    void loadReadOnly();
  };

  return <div className={`caltra-chat caltra-browser-live-view${className ? ` ${className}` : ""}`} data-color-mode="system" aria-label={labels.title}>
    {notice && <div className="caltra-chat__connection" role="alert">{notice}</div>}
    {view.kind === "loading" && <div className="caltra-chat__connection" role="status">{labels.loading}</div>}
    {(view.kind === "empty" || view.kind === "failed") && <div className="caltra-chat__connection" role={view.kind === "failed" ? "alert" : "status"}>
      {view.kind === "empty" ? labels.noActiveSession : labels.failed}
      <Button variant="ghost" size="sm" onClick={refresh}>{labels.refresh}</Button>
    </div>}
    {(view.kind === "read_only" || view.kind === "interactive") && <>
      <div className="flex justify-end px-4 pb-2">
        {view.kind === "read_only"
          ? <Button size="sm" disabled={busy} onClick={() => { void takeOver(); }}>{labels.takeOver}</Button>
          : <Button size="sm" variant="secondary" disabled={busy} onClick={() => { void handBack(); }}>{labels.handBack}</Button>}
      </div>
      <iframe title={labels.title} src={view.url} sandbox="allow-same-origin allow-scripts"
        className="min-h-0 w-full flex-1 border-0" />
    </>}
  </div>;
}
