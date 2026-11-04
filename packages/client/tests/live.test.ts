import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CaltraLive,type CaltraLiveOwner} from '../src/live.js';
const sessionId='40000000-0000-4000-8000-000000000001';
class Peer {
 static current:Peer; constructor(){Peer.current=this;}
 iceGatheringState='complete';connectionState='new';localDescription={sdp:'offer'};
 channel={onmessage:undefined as undefined|((event:{data:string})=>void),onclose:undefined as undefined|(()=>void),onerror:undefined as undefined|(()=>void),readyState:'open',send:vi.fn(),close:vi.fn()};
 ontrack?:unknown;onconnectionstatechange?:()=>void;
 createDataChannel(){return this.channel;}addTrack=vi.fn();createOffer=async()=>({type:'offer',sdp:'offer'});
 setLocalDescription=vi.fn(async()=>{});setRemoteDescription=vi.fn(async()=>{});close=vi.fn();
 event(type:string){this.channel.onmessage?.({data:JSON.stringify({type})});}
}
class AudioStub {autoplay=false;srcObject=null;play=vi.fn(async()=>{});pause=vi.fn();}
const track={enabled:true,stop:vi.fn()};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
const connection=(owner:CaltraLiveOwner)=>({id:owner.connectionId,session_id:sessionId,status:'active' as const,state_revision:1,created_at:'now',connected_at:'now',ended_at:null,end_code:null});
const transport=()=>({getLiveConnection:vi.fn(async()=>({enabled:true,connection:null})),startLiveConnection:vi.fn(async(_session:string,owner:CaltraLiveOwner)=>({connection:connection(owner),sdp_answer:'answer'})),stopLiveConnection:vi.fn(async()=>({connection:null}))});
beforeEach(()=>{vi.stubGlobal('RTCPeerConnection',Peer);vi.stubGlobal('Audio',AudioStub);vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn(async()=>stream)}});track.enabled=true;track.stop.mockClear();});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('creates one owner, waits for provider readiness, mutes, and releases every media resource',async()=>{
 const client=transport(),changed=vi.fn(),live=new CaltraLive(client,sessionId,changed);
 const first=live.start();expect(live.start()).toBe(first);await first;
 expect(client.startLiveConnection).toHaveBeenCalledTimes(1);expect(live.getSnapshot().status).toBe('connecting');
 expect(live.owner?.controlToken).toMatch(/^[a-f0-9]{64}$/);Peer.current.event('session.started');expect(live.getSnapshot().status).toBe('active');
 live.setMuted(true);expect(track.enabled).toBe(false);expect(Peer.current.channel.send).toHaveBeenCalled();
 await live.stop();expect(track.stop).toHaveBeenCalledOnce();expect(Peer.current.close).toHaveBeenCalledOnce();expect(live.owner).toBeUndefined();expect(client.stopLiveConnection).toHaveBeenCalledOnce();
});
it('cancels while microphone permission is pending without reserving a connection',async()=>{
 let release!:(value:typeof stream)=>void;vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{release=resolve;})}});
 const client=transport(),live=new CaltraLive(client,sessionId,()=>{});const start=live.start();await live.stop();release(stream);await start;
 expect(track.stop).toHaveBeenCalledOnce();expect(client.startLiveConnection).not.toHaveBeenCalled();expect(live.getSnapshot().status).toBe('idle');
});
it('cleans up a rejected start and reports ownership in another tab',async()=>{
 const client=transport();client.startLiveConnection.mockRejectedValue(new Error('Live already active'));
 client.getLiveConnection.mockResolvedValue({enabled:true,connection:connection({connectionId:crypto.randomUUID(),controlToken:'other'})} as never);
 const live=new CaltraLive(client,sessionId,()=>{});await live.start();expect(live.getSnapshot()).toMatchObject({status:'idle',elsewhere:true,error:'Live already active'});expect(track.stop).toHaveBeenCalledOnce();
});
it('ends a connection that never becomes ready',async()=>{
 vi.useFakeTimers();const client=transport(),live=new CaltraLive(client,sessionId,()=>{});await live.start();await vi.advanceTimersByTimeAsync(20001);
 expect(live.getSnapshot()).toMatchObject({status:'idle',error:expect.stringContaining('timed out')});expect(client.stopLiveConnection).toHaveBeenCalledOnce();
});

it('allows a new start after cancelling an unresolved microphone request',async()=>{
 const releases:Array<(value:typeof stream)=>void>=[];vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise(resolve=>releases.push(resolve as never))}});
 const client=transport(),live=new CaltraLive(client,sessionId,()=>{});const first=live.start();await live.stop();const second=live.start();expect(releases).toHaveLength(2);
 releases[0]!(stream);await first;expect(live.getSnapshot().status).toBe('connecting');expect(client.startLiveConnection).not.toHaveBeenCalled();
 releases[1]!(stream);await second;expect(client.startLiveConnection).toHaveBeenCalledOnce();await live.stop();
});

it('does not re-enable audio when stopped while applying the remote answer',async()=>{
 let release!:()=>void;
 const client=transport(),live=new CaltraLive(client,sessionId,()=>{});
 client.startLiveConnection.mockImplementation(async(_session,owner)=>{
  Peer.current.setRemoteDescription.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
  return {connection:connection(owner),sdp_answer:'answer'};
 });
 const start=live.start();await vi.waitFor(()=>expect(release).toBeDefined());
 await live.stop();release();await start;
 expect(track.enabled).toBe(false);expect(track.stop).toHaveBeenCalledOnce();expect(live.getSnapshot().status).toBe('idle');
});

it('releases local audio immediately even when server stop is delayed',async()=>{
 let release!:(value:{connection:null})=>void;
 const client=transport(),live=new CaltraLive(client,sessionId,()=>{});await live.start();Peer.current.event('session.started');
 client.stopLiveConnection.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const stop=live.stop();expect(track.stop).toHaveBeenCalledOnce();expect(Peer.current.close).toHaveBeenCalledOnce();
 release({connection:null});await stop;
});

it.each(['failed','closed','channel-close','channel-error'])('closes failed transport during startup: %s',async failure=>{
 const client=transport(),live=new CaltraLive(client,sessionId,()=>{});await live.start();
 if(failure==='channel-close')Peer.current.channel.onclose?.();
 else if(failure==='channel-error')Peer.current.channel.onerror?.();
 else {Peer.current.connectionState=failure;Peer.current.onconnectionstatechange?.();}
 await vi.waitFor(()=>expect(live.getSnapshot().status).toBe('idle'));
 expect(client.stopLiveConnection).toHaveBeenCalledOnce();expect(track.stop).toHaveBeenCalledOnce();
 expect(live.getSnapshot().error).toContain('lost');
});

it('allows brief disconnection but ends a persistent one',async()=>{
 vi.useFakeTimers();const client=transport(),live=new CaltraLive(client,sessionId,()=>{});await live.start();Peer.current.event('session.started');
 Peer.current.connectionState='disconnected';Peer.current.onconnectionstatechange?.();await vi.advanceTimersByTimeAsync(5000);
 Peer.current.connectionState='connected';Peer.current.onconnectionstatechange?.();await vi.advanceTimersByTimeAsync(10000);
 expect(client.stopLiveConnection).not.toHaveBeenCalled();expect(live.getSnapshot().status).toBe('active');
 Peer.current.connectionState='disconnected';Peer.current.onconnectionstatechange?.();await vi.advanceTimersByTimeAsync(10001);
 expect(client.stopLiveConnection).toHaveBeenCalledOnce();expect(live.getSnapshot().status).toBe('idle');
});
