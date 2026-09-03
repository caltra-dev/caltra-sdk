import { z } from "zod";
import type { CaltraServerProblem } from "./types.js";

const ServerProblemSchema = z.object({
  code: z.string(),
  detail: z.string(),
  request_id: z.string(),
  retryable: z.boolean(),
  status: z.number().int(),
  title: z.string(),
  type: z.string(),
}).strict();

/** Exposes Caltra's structured problem details so server applications can make retry decisions. */
export class CaltraServerError extends Error {
  constructor(readonly problem: CaltraServerProblem) {
    super(problem.detail);
    this.name = "CaltraServerError";
  }

  get code(): string {
    return this.problem.code;
  }

  get requestId(): string {
    return this.problem.request_id;
  }

  get retryable(): boolean {
    return this.problem.retryable;
  }

  get status(): number {
    return this.problem.status;
  }

  static async fromResponse(response: Response): Promise<CaltraServerError> {
    try {
      return new CaltraServerError(ServerProblemSchema.parse(await response.json()));
    } catch {
      return new CaltraServerError({
        code: "invalid_response",
        detail: `Caltra returned HTTP ${response.status} without a valid problem body.`,
        request_id: response.headers.get("x-request-id") ?? "",
        retryable: response.status >= 500,
        status: response.status,
        title: "Invalid response",
        type: "about:blank",
      });
    }
  }
}
