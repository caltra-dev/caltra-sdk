import {expect,it,vi} from 'vitest';
import {CaltraServerClient} from '../src/client.js';
const id='10000000-0000-4000-8000-000000000001';
const wire={enabled:true,platform_model_id:id,voice:'marin',models:[{id,name:'Live'}]};
const target={workspaceId:'workspace/id',agentId:'agent/id'};
it('encodes scope and reads public Live settings without changing the runtime',async()=>{
 const fetch=vi.fn(async()=>Response.json(wire));const client=new CaltraServerClient({apiKey:'test',apiUrl:'https://caltra.example',fetch});
 expect(await client.agents.getLiveSettings(target)).toEqual({enabled:true,platformModelId:id,voice:'marin',models:wire.models});
 expect(fetch).toHaveBeenCalledWith('https://caltra.example/server/v1/workspaces/workspace%2Fid/agents/agent%2Fid/live-settings',{method:'GET',headers:{authorization:'Bearer test'}});
});
it.each([true,false])('writes only explicit Live fields, enabled=%s',async enabled=>{
 const fetch=vi.fn(async()=>Response.json({...wire,enabled}));const client=new CaltraServerClient({apiKey:'test',fetch});
 await client.agents.updateLiveSettings({...target,settings:{enabled,platformModelId:id,voice:'marin'}});
 const init=fetch.mock.calls[0] as unknown as [unknown,RequestInit];
 expect(init[1].method).toBe('PATCH');expect(JSON.parse(String(init[1].body))).toEqual({enabled,platform_model_id:id,voice:'marin'});
});
it.each([400,401,403,404])('propagates authorization and eligibility errors (%s)',async status=>{
 const client=new CaltraServerClient({apiKey:'test',fetch:async()=>Response.json({code:'invalid_live_settings',detail:'Unavailable',request_id:'test',retryable:false,status,title:'Unavailable',type:'about:blank'},{status})});
 await expect(client.agents.updateLiveSettings({...target,settings:{enabled:true,platformModelId:id,voice:'marin'}})).rejects.toMatchObject({status});
});
it('rejects credential-bearing or malformed configuration responses',async()=>{
 const client=new CaltraServerClient({apiKey:'test',fetch:async()=>Response.json({...wire,secret:'must-not-be-accepted'})});
 await expect(client.agents.getLiveSettings(target)).rejects.toThrow();
});
