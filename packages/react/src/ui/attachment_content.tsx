"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CaltraSessionRuntime } from "@caltra/client";

/** File access belongs to the current chat identity; URLs never enter the transcript or model input. */
export const AttachmentSession = createContext<CaltraSessionRuntime | undefined>(undefined);

export const previewableImage = (mediaType: string) => ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType);

/** Resolves one mounted attachment, discarding late responses and releasing image bytes on unmount. */
export function useAttachmentContent(id: string, mediaType: string, pending = false) {
  const session = useContext(AttachmentSession);
  const [attempt, setAttempt] = useState(0);
  const [entry, setEntry] = useState<{ id: string; session: CaltraSessionRuntime; url?: string; error?: boolean }>();
  const [downloading, setDownloading] = useState(false);
  const lifetime = useRef<AbortController | undefined>(undefined);
  const pendingDownload = useRef(false);
  useEffect(() => {
    if (!session || pending) return;
    const controller = new AbortController();
    lifetime.current = controller;
    let objectUrl: string | undefined;
    setEntry({ id, session });
    void (async () => {
      try {
        const access = await session.downloadAttachment(id);
        if (controller.signal.aborted) return;
        let url = access.url;
        if (previewableImage(mediaType)) {
          // S3 serves downloads as octet-stream. Only allowlisted raster images
          // become displayable blobs; HTML/SVG and other formats remain downloads.
          const response = await fetch(url, { signal: controller.signal, credentials: "omit", cache: "no-store" });
          if (!response.ok) throw new Error("Attachment unavailable");
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(new Blob([blob], { type: mediaType }));
          url = objectUrl;
        }
        if (!controller.signal.aborted) setEntry({ id, session, url });
      } catch {
        if (!controller.signal.aborted) setEntry({ id, session, error: true });
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [session, id, mediaType, pending, attempt]);

  const current = entry?.id === id && entry.session === session ? entry : undefined;
  return {
    available: Boolean(session), url: current?.url, error: current?.error,
    loading: Boolean(session) && !current?.url && !current?.error, downloading,
    retry: () => setAttempt(value => value + 1),
    download: async (name: string) => {
      if (!session || pendingDownload.current) return;
      const controller = lifetime.current;
      pendingDownload.current = true;
      setDownloading(true);
      try {
        // A displayed link may have expired. Reauthorize every normal click.
        const { url } = await session.downloadAttachment(id);
        if (controller?.signal.aborted) return;
        const link = document.createElement("a");
        link.href = url; link.download = name; link.rel = "noopener noreferrer";
        // This is an external S3 download with Content-Disposition: attachment,
        // not an internal application navigation. The Caltra API token stays private.
        document.body.append(link); link.click(); link.remove();
      } catch {
        if (!controller?.signal.aborted) setEntry({ id, session, error: true });
      } finally {
        pendingDownload.current = false;
        if (!controller?.signal.aborted) setDownloading(false);
      }
    },
  };
}
