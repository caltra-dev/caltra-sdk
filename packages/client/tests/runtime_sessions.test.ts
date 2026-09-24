import { describe, expect, it } from "vitest";
import { CaltraClient } from "../src/client.js";
const runtimeId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
describe('runtime session collection',()=>{
  it('creates sessions under the resolved runtime without sending any agent selector',async()=>{
    const paths: string[]=[];
    const client=new CaltraClient({ apiUrl:'https://caltra.example', authorizationCodeProvider:async()=> 'code', fetch:async(input,init)=>{
      const url=String(input); paths.push(url);
      if(url.endsWith('/auth/authenticate')) return Response.json({client_token:'test',expires_at:new Date(Date.now()+600000).toISOString(),refresh_after:new Date(Date.now()+500000).toISOString()});
      if(url.endsWith('/runtimes/get')) return Response.json({id:runtimeId,name:'My runtime'});
      expect(url).toBe(`https://caltra.example/client/v1/runtimes/${runtimeId}/sessions/get`);
      expect(JSON.parse(String(init?.body))).toEqual({external_id:'primary',create_if_missing:{}});
      return Response.json({id:sessionId,runtime:{id:runtimeId,name:'My runtime'},agent:null,auto_name:false,title:null,title_source:null,title_updated_at:null,external_id:'primary',status:'active',created_at:'2026-09-09T00:00:00Z',updated_at:'2026-09-09T00:00:00Z'});
    }});
    const runtime=await client.runtimes.get();
    expect(await runtime.sessions.get({externalId:'primary',createIfMissing:{}})).toMatchObject({id:sessionId,agent:null,runtime:{id:runtimeId}});
    expect(paths).toHaveLength(3);
  });
});
