import { createParser, type EventSourceMessage } from "eventsource-parser";
import { z } from "zod";
import type { CaltraSessionEvent } from "./types.js";

const EventDataSchema = z.object({
  message_id: z.string().uuid(),
  session_id: z.string().uuid(),
  turn_id: z.string().uuid(),
}).strict();

const DeltaDataSchema = EventDataSchema.extend({ delta: z.string() }).strict();

/** Converts one authenticated fetch response into validated Caltra lifecycle events. */
export class CaltraSessionEventConnection implements AsyncIterable<CaltraSessionEvent> {
  private readonly events: CaltraSessionEvent[] = [];
  private readonly waiters: Array<{
    reject: (reason: unknown) => void;
    resolve: (value: IteratorResult<CaltraSessionEvent>) => void;
  }> = [];
  private error: unknown;
  private finished = false;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;

  constructor(response: Response) {
    if (!response.body) throw new Error("Caltra's event response does not contain a body.");
    this.reader = response.body.getReader();
    void this.read();
  }

  [Symbol.asyncIterator](): AsyncIterator<CaltraSessionEvent> {
    return {
      next: async () => await this.next(),
      return: async () => {
        await this.close();
        return { done: true, value: undefined };
      },
    };
  }

  async close(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.reader?.cancel();
    this.resolveWaiters();
  }

  private async next(): Promise<IteratorResult<CaltraSessionEvent>> {
    const event = this.events.shift();
    if (event) return { done: false, value: event };
    if (this.error) throw this.error;
    if (this.finished) return { done: true, value: undefined };
    return await new Promise<IteratorResult<CaltraSessionEvent>>((resolve, reject) => {
      this.waiters.push({ reject, resolve });
    });
  }

  private async read(): Promise<void> {
    const decoder = new TextDecoder();
    const parser = createParser({
      onEvent: (message) => this.push(this.parse(message)),
    });
    try {
      while (!this.finished) {
        const result = await this.reader!.read();
        if (result.done) break;
        parser.feed(decoder.decode(result.value, { stream: true }));
      }
      parser.feed(decoder.decode());
      this.finished = true;
      this.resolveWaiters();
    } catch (error) {
      if (this.finished) return;
      this.error = error;
      this.finished = true;
      this.rejectWaiters(error);
    }
  }

  private parse(message: EventSourceMessage): CaltraSessionEvent {
    const event = message.event;
    const value: unknown = JSON.parse(message.data);
    if (event === "message.delta") {
      return { data: DeltaDataSchema.parse(value), event, id: message.id ?? "" };
    }
    if (event === "message.started" || event === "message.completed") {
      return { data: EventDataSchema.parse(value), event, id: message.id ?? "" };
    }
    throw new Error(`Unsupported Caltra session event: ${event ?? "unnamed"}`);
  }

  private push(event: CaltraSessionEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ done: false, value: event });
    else this.events.push(event);
  }

  private resolveWaiters(): void {
    for (const waiter of this.waiters.splice(0)) waiter.resolve({ done: true, value: undefined });
  }

  private rejectWaiters(error: unknown): void {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }
}
