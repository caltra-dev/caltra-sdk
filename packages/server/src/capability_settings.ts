import { z } from "zod";
import { CaltraServerError } from "./error.js";

export type CaltraCapabilityLoadingMode = "on_demand" | "summary" | "full_definition";
export type CaltraCapabilitySettingsTarget = {kind: "environment" | "agent" | "session"; id: string};
export type CaltraCapabilitySettingsChange = {capabilityId: string; mode?: CaltraCapabilityLoadingMode; enabled?: boolean};
export type CaltraCapabilitySettingsRead = {workspaceId: string; target: CaltraCapabilitySettingsTarget; query?: string; offset?: number};
export type CaltraCapabilitySettingsUpdate = {
  workspaceId: string;
  target: CaltraCapabilitySettingsTarget;
  changes: CaltraCapabilitySettingsChange[];
  /** Environment targets only: also patch these fields on existing non-revoked hosted runtimes. */
  applyToExistingRuntimes?: boolean;
};
export type CaltraCapabilitySettingsChoice = {
  id: string; name: string; description: string; kind: string; enabled: boolean;
  environmentMode: CaltraCapabilityLoadingMode; mode: CaltraCapabilityLoadingMode;
  /** Compatibility field equal to mode; choices no longer inherit. */
  override: CaltraCapabilityLoadingMode;
};

/** Configures saved runtime choices and creation defaults using an environment server key with agents:provision. */
export class CaltraCapabilitySettingsClient {
  private static readonly mode = z.enum(["on_demand", "summary", "full_definition"]);
  private static readonly target = z.object({kind:z.enum(["environment","agent","session"]),id:z.uuid()}).strict();
  private static readonly change = z.object({capabilityId:z.uuid(),mode:this.mode.optional(),enabled:z.boolean().optional()}).strict()
    .refine(value => value.mode !== undefined || value.enabled !== undefined, "Specify loading or enablement.");
  constructor(private readonly apiKey: string, private readonly apiUrl: string, private readonly fetchImplementation: typeof fetch) {}

  /** Returns a bounded page, including the number of runtimes an explicit environment bulk update would affect. */
  async list(input: CaltraCapabilitySettingsRead): Promise<{nodes: CaltraCapabilitySettingsChoice[];totalCount: number;runtimeCount: number}> {
    const body=z.object({target:CaltraCapabilitySettingsClient.target,query:z.string().max(100).optional(),offset:z.number().int().min(0).max(1000000).optional()}).parse(input);
    const mode=CaltraCapabilitySettingsClient.mode;
    return z.object({nodes:z.array(z.object({id:z.uuid(),name:z.string(),description:z.string(),kind:z.string(),enabled:z.boolean(),environmentMode:mode,mode,override:mode})),totalCount:z.number().int(),runtimeCount:z.number().int()}).parse(await this.request(input.workspaceId,"read",body));
  }

  /** Patches only supplied fields. Defaults do not affect existing runtimes unless explicitly requested; sessions remain unchanged. */
  async update(input: CaltraCapabilitySettingsUpdate): Promise<{id: string;affectedRuntimes: number}> {
    const body=z.object({target:CaltraCapabilitySettingsClient.target,changes:z.array(CaltraCapabilitySettingsClient.change).max(1000),applyToExistingRuntimes:z.boolean().optional()}).parse(input);
    if (body.applyToExistingRuntimes && body.target.kind !== "environment") throw new TypeError("Bulk application requires an environment target.");
    if (body.target.kind === "session" && body.changes.some(change => change.enabled !== undefined)) throw new TypeError("Enablement is controlled by the runtime.");
    return z.object({id:z.uuid(),affectedRuntimes:z.number().int()}).parse(await this.request(input.workspaceId,"set",body));
  }

  private async request(workspaceId: string, operation: "read" | "set", body: object): Promise<unknown> {
    const response=await this.fetchImplementation(`${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(workspaceId)}/capability-loading/${operation}`,{
      method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json"},body:JSON.stringify(body),
    });
    if (!response.ok) throw await CaltraServerError.fromResponse(response);
    return response.json();
  }
}
