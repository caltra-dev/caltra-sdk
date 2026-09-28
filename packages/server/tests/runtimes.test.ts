import { describe, expect, it } from "vitest";
import { CaltraServerClient } from "../src/client.js";
describe('server runtimes',()=>{
  it('provisions the tenant runtime without provisioning an agent',async()=>{
    const client=new CaltraServerClient({apiKey:'test',apiUrl:'https://caltra.example',fetch:async(input,init)=>{
      expect(String(input)).toBe('https://caltra.example/server/v1/workspaces/workspace/runtimes/get');
      expect(JSON.parse(String(init?.body))).toEqual({owner:{tenant_user_external_id:'user'},create_if_missing:{name:'My runtime'},sync_name:'My runtime'});
      return Response.json({id:'10000000-0000-4000-8000-000000000001',name:'My runtime'});
    }});
    await expect(client.runtimes.get({workspaceId:'workspace',owner:{tenantUserExternalId:'user'},createIfMissing:{name:'My runtime'},syncName:'My runtime'})).resolves.toMatchObject({name:'My runtime'});
  });
});

it("sends stable project identity and trusted instructions on runtime lookup", async () => {
  const client = new CaltraServerClient({ apiKey: "test", apiUrl: "https://caltra.example", fetch: async (_input, init) => {
    expect(JSON.parse(String(init?.body))).toEqual({ external_id: "project-123", instructions: "Plan the project.", owner: { tenant_user_external_id: "user" }, create_if_missing: { name: "Project planning" } });
    return Response.json({ id: "10000000-0000-4000-8000-000000000001", name: "Project planning" });
  } });
  await client.runtimes.get({ workspaceId: "workspace", owner: { tenantUserExternalId: "user" }, externalId: "project-123", instructions: "Plan the project.", createIfMissing: { name: "Project planning" } });
});
