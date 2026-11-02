import { describe, expect, it, vi } from "vitest";
import { CaltraServerClient } from "../src/client.js";
import type { CaltraCapabilityLoadingMode } from "../src/capability_settings.js";

const id="10000000-0000-4000-8000-000000000001";
const capabilityId="20000000-0000-4000-8000-000000000001";
const choice={id:capabilityId,name:"Read",description:"Read records",kind:"backend_tool",enabled:true,environmentMode:"summary",mode:"on_demand",override:"on_demand"};
describe("concrete capability settings", () => {
  it("authenticates paged reads without interpreting defaults as the runtime choice", async () => {
    const request=vi.fn(async()=>Response.json({nodes:[choice],totalCount:1,runtimeCount:7}));
    const client=new CaltraServerClient({apiKey:"test",apiUrl:"https://caltra.example",fetch:request});
    expect(await client.capabilitySettings.list({workspaceId:"workspace/id",target:{kind:"agent",id},offset:50})).toEqual({nodes:[choice],totalCount:1,runtimeCount:7});
    expect(request).toHaveBeenCalledWith("https://caltra.example/server/v1/workspaces/workspace%2Fid/capability-loading/read",{method:"POST",headers:{authorization:"Bearer test","content-type":"application/json"},body:JSON.stringify({target:{kind:"agent",id},offset:50})});
  });
  it("preserves omitted fields and sends bulk application only when explicitly selected", async () => {
    const request=vi.fn(async()=>Response.json({id,affectedRuntimes:7}));
    const client=new CaltraServerClient({apiKey:"test",fetch:request});
    const target={kind:"environment" as const,id};
    await client.capabilitySettings.update({workspaceId:id,target,changes:[{capabilityId,enabled:false}]});
    expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toEqual({target,changes:[{capabilityId,enabled:false}]});
    await client.capabilitySettings.update({workspaceId:id,target,changes:[{capabilityId,mode:"summary"}],applyToExistingRuntimes:true});
    expect(JSON.parse(request.mock.calls[1]![1]!.body as string)).toEqual({target,changes:[{capabilityId,mode:"summary"}],applyToExistingRuntimes:true});
  });
  it("rejects inheritance and invalid bulk/session enablement before making a request", async () => {
    const request=vi.fn<typeof fetch>();const client=new CaltraServerClient({apiKey:"test",fetch:request});
    await expect(client.capabilitySettings.update({workspaceId:id,target:{kind:"agent",id},changes:[{capabilityId,mode:null as unknown as CaltraCapabilityLoadingMode}]})).rejects.toThrow();
    await expect(client.capabilitySettings.update({workspaceId:id,target:{kind:"agent",id},changes:[],applyToExistingRuntimes:true})).rejects.toThrow("environment");
    await expect(client.capabilitySettings.update({workspaceId:id,target:{kind:"session",id},changes:[{capabilityId,enabled:true}]})).rejects.toThrow("runtime");
    expect(request).not.toHaveBeenCalled();
  });
  it("propagates access errors", async () => {
    const client=new CaltraServerClient({apiKey:"test",fetch:async()=>Response.json({code:"scope_denied",detail:"Unavailable",status:403,title:"Denied",type:"about:blank",request_id:"request",retryable:false},{status:403})});
    await expect(client.capabilitySettings.list({workspaceId:id,target:{kind:"environment",id}})).rejects.toMatchObject({status:403,code:"scope_denied"});
  });
});
