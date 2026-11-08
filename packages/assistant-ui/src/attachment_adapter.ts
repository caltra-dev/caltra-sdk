import type { Attachment, AttachmentAdapter, CompleteAttachment, PendingAttachment } from "@assistant-ui/react";
import type { CaltraSessionRuntime } from "@caltra/client";

/** Native composer staging keeps bytes outside message context and blocks send until S3 confirms upload. */
export class CaltraAttachmentAdapter implements AttachmentAdapter {
  readonly accept = "*";
  private readonly uploads = new Map<string, AbortController>();
  private readonly complete = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private pending = 0;
  constructor(private readonly session: CaltraSessionRuntime) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  isSendBlocked = () => this.pending > 0 || this.failed.size > 0;

  async *add({ file }: { file: File }): AsyncGenerator<PendingAttachment, void> {
    this.pending += 1; this.notify();
    let id: string | undefined;
    try {
      const staged = await this.session.stageAttachment(file);
      id = staged.attachment.id;
      const controller = new AbortController(); this.uploads.set(id, controller);
      const attachment = { id, name: file.name, file, contentType: staged.attachment.media_type,
        type: file.type.startsWith("image/") ? "image" as const : "file" as const };
      yield { ...attachment, status: { type: "running", reason: "uploading", progress: 0 } };
      const response = await fetch(staged.url, { method: "PUT", headers: Object.fromEntries(staged.headers.map(header => [header.name, header.value])), body: file, signal: controller.signal });
      if (!response.ok) throw new Error("Upload failed. Remove the attachment and try again.");
      if (controller.signal.aborted) return;
      await this.session.finalizeAttachment(id);
      if (controller.signal.aborted) return;
      this.complete.add(id);
      yield { ...attachment, status: { type: "requires-action", reason: "composer-send" } };
    } catch (error) {
      if (id && !this.uploads.get(id)?.signal.aborted) this.failed.add(id);
      throw error;
    } finally { if (id) this.uploads.delete(id); this.pending -= 1; this.notify(); }
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    if (!this.complete.has(attachment.id)) throw new Error("Wait for the upload to finish.");
    return { ...attachment, status: { type: "complete" }, content: [] };
  }

  async remove(attachment: Attachment): Promise<void> {
    this.uploads.get(attachment.id)?.abort();
    await this.session.removeAttachment(attachment.id);
    this.complete.delete(attachment.id); this.failed.delete(attachment.id); this.notify();
  }
  private notify() { for (const listener of this.listeners) listener(); }
}
