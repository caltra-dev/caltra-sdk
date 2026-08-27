import type { CaltraApiProblem } from "./types.js";

/** Preserves Caltra's stable RFC problem fields for application-level recovery decisions. */
export class CaltraApiError extends Error {
  constructor(readonly problem: CaltraApiProblem) {
    super(problem.detail);
    this.name = "CaltraApiError";
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

  static async fromResponse(response: Response): Promise<CaltraApiError> {
    try {
      const problem = await response.json() as CaltraApiProblem;
      return new CaltraApiError(problem);
    } catch {
      return new CaltraApiError({
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
