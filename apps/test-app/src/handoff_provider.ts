import { z } from "zod";

const HandoffSchema = z.object({
  expires_at: z.iso.datetime(),
  handoff_code: z.string().min(1),
}).strict();

/** Requests a fresh handoff from the application's same-origin authenticated backend route. */
export class TestAppHandoffProvider {
  private readonly fetchImplementation: typeof fetch;

  constructor(fetchImplementation?: typeof fetch) {
    this.fetchImplementation = fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  async create(): Promise<string> {
    const response = await this.fetchImplementation("/api/client-handoff", { method: "POST" });
    if (!response.ok) throw new Error(`Local client handoff failed with HTTP ${response.status}.`);
    return HandoffSchema.parse(await response.json()).handoff_code;
  }
}
