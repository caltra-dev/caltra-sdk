import { z } from "zod";
import { CaltraServerError } from "./error.js";
import type {
  CaltraServerWorkspace,
  CaltraWorkspaceCreateIfMissing,
  CaltraWorkspaceLookup,
} from "./types.js";

const WorkspaceSchema = z.object({
  external_id: z.string().min(1).max(255),
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
}).strict();

/** Resolves customer tenant identifiers to stable Caltra workspaces for one API-key organization. */
export class CaltraWorkspacesClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
    private readonly fetchImplementation: typeof fetch,
  ) {}

  async get(input: CaltraWorkspaceCreateIfMissing): Promise<CaltraServerWorkspace>;
  async get(input: CaltraWorkspaceLookup): Promise<CaltraServerWorkspace | null>;
  async get(
    input: CaltraWorkspaceLookup | CaltraWorkspaceCreateIfMissing,
  ): Promise<CaltraServerWorkspace | null> {
    const createIfMissing = "createIfMissing" in input ? input.createIfMissing : undefined;
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("authorization", `Bearer ${this.apiKey}`);
    const response = await this.fetchImplementation(
      `${this.apiUrl}/server/v1/workspaces/get`,
      {
        body: JSON.stringify({
          ...(createIfMissing ? { create_if_missing: createIfMissing } : {}),
          external_id: input.externalId,
        }),
        headers,
        method: "POST",
      },
    );
    if (!response.ok) {
      const error = await CaltraServerError.fromResponse(response);
      if (!createIfMissing && error.status === 404 && error.code === "resource_not_found") {
        return null;
      }
      throw error;
    }
    const workspace = WorkspaceSchema.parse(await response.json());
    return {
      externalId: workspace.external_id,
      id: workspace.id,
      name: workspace.name,
    };
  }
}
