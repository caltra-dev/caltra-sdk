import { z } from "zod";
import { CaltraServerError } from "./error.js";

export interface CaltraAgentLiveSettingsTarget { workspaceId:string;agentId:string }
export interface CaltraAgentLiveSettings { enabled:boolean;platformModelId:string|null;voice:string|null }
export interface CaltraAgentLiveConfiguration extends CaltraAgentLiveSettings { models:Array<{id:string;name:string}> }
export interface CaltraAgentLiveSettingsUpdate extends CaltraAgentLiveSettingsTarget { settings:CaltraAgentLiveSettings }

/** Manages server-only voice configuration while leaving the reasoning model independent. */
export class CaltraAgentLiveSettingsClient {
  constructor(private readonly apiKey:string,private readonly apiUrl:string,private readonly fetchImplementation:typeof fetch) {}
  async request(target:CaltraAgentLiveSettingsTarget,settings?:CaltraAgentLiveSettings):Promise<CaltraAgentLiveConfiguration> {
    const response=await this.fetchImplementation(`${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(target.workspaceId)}/agents/${encodeURIComponent(target.agentId)}/live-settings`,{
      method:settings?"PATCH":"GET",headers:{authorization:`Bearer ${this.apiKey}`,...(settings?{"content-type":"application/json"}:{})},
      ...(settings?{body:JSON.stringify({enabled:settings.enabled,platform_model_id:settings.platformModelId,voice:settings.voice})}:{}),
    });
    if(!response.ok)throw await CaltraServerError.fromResponse(response);
    const result=z.object({enabled:z.boolean(),platform_model_id:z.uuid().nullable(),voice:z.string().nullable(),models:z.array(z.object({id:z.uuid(),name:z.string()}).strict())}).strict().parse(await response.json());
    return {enabled:result.enabled,platformModelId:result.platform_model_id,voice:result.voice,models:result.models};
  }
}
