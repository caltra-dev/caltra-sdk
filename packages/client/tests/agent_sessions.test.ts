import { describe, expect, it } from "vitest";
import { CaltraClient } from "../src/client.js";
const agentId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
describe('agent session collection',()=>{
  it('creates sessions under the resolved agent without sending any agent identity selector',async()=>{
    const paths: string[]=[];
    const client=new CaltraClient({ apiUrl:'https://caltra.example', authorizationCodeProvider:async()=> 'code', fetch:async(input,init)=>{
      const url=String(input); paths.push(url);
      if(url.endsWith('/auth/authenticate')) return Response.json({client_token:'test',expires_at:new Date(Date.now()+600000).toISOString(),refresh_after:new Date(Date.now()+500000).toISOString()});
      if(url.endsWith('/agents/get')) return Response.json({id:agentId,name:'My agent'});
      expect(url).toBe(`https://caltra.example/client/v1/agents/${agentId}/sessions/get`);
      expect(JSON.parse(String(init?.body))).toEqual({external_id:'primary',create_if_missing:{}});
      return Response.json({id:sessionId,agent:{id:agentId,name:'My agent'},agentIdentity:null,auto_name:false,title:null,title_source:null,title_updated_at:null,external_id:'primary',status:'active',created_at:'2026-09-09T00:00:00Z',updated_at:'2026-09-09T00:00:00Z'});
    }});
    const agent=await client.agents.get();
    expect(await agent.sessions.get({externalId:'primary',createIfMissing:{}})).toMatchObject({id:sessionId,agentIdentity:null,agent:{id:agentId}});
    expect(paths).toHaveLength(3);
  });
});
