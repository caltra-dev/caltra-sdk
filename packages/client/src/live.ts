import { z } from 'zod';
import type { CaltraClient } from './client.js';

export const LiveResponseSchema=z.object({enabled:z.boolean().optional(),sdp_answer:z.string().nullable().optional(),connection:z.object({
  id:z.string().uuid(),session_id:z.string().uuid(),status:z.enum(['starting','active','ending','ended','failed']),state_revision:z.number(),
  created_at:z.string(),connected_at:z.string().nullable(),ended_at:z.string().nullable(),end_code:z.string().nullable(),
}).nullable()});
export type CaltraLiveResponse=z.infer<typeof LiveResponseSchema>;
export type CaltraLiveOwner={connectionId:string;controlToken:string};
export interface CaltraLiveSnapshot {
  enabled:boolean; status:'idle'|'connecting'|'active'|'ending'; muted:boolean; elsewhere:boolean;
  error:string|null; playbackBlocked:boolean; amplitude:number; speaking:boolean;
  transcript:readonly {id:string;role:'user'|'assistant';text:string}[];
}
type Transport=Pick<CaltraClient,'getLiveConnection'|'startLiveConnection'|'stopLiveConnection'>;

/** Owns one tab's native WebRTC resources; server ownership remains authoritative. */
export class CaltraLive {
  private snapshot:CaltraLiveSnapshot={enabled:false,status:'idle',muted:false,elsewhere:false,error:null,playbackBlocked:false,amplitude:0,speaking:false,transcript:[]};
  private readonly listeners=new Set<()=>void>();
  private peer?:RTCPeerConnection;private stream?:MediaStream;private audio?:HTMLAudioElement;private channel?:RTCDataChannel;
  private audioContext?:AudioContext;private frame?:number;private abort?:AbortController;
  private pending?:Promise<void>;private stopping?:Promise<void>;private generation=0;private lastSpeakerAt=0;private readiness?:ReturnType<typeof setTimeout>;
  owner?:CaltraLiveOwner;
  constructor(private readonly client:Transport,private readonly sessionId:string,private readonly ownerChanged:()=>void) {}
  readonly subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  readonly getSnapshot=()=>this.snapshot;
  async refresh():Promise<void> {
    try {
      const result=await this.client.getLiveConnection(this.sessionId);
      const open=result.connection&&['starting','active','ending'].includes(result.connection.status);
      this.update({enabled:result.enabled??false,elsewhere:Boolean(open&&result.connection!.id!==this.owner?.connectionId)});
      if(this.owner&&result.connection?.id===this.owner.connectionId&&!open&&this.snapshot.status!=='idle') {
        this.generation++;this.cleanup();this.owner=undefined;this.ownerChanged();this.update({status:'idle',error:result.connection.end_code==='user_stopped'?null:'The live connection ended. You can start a new call.'});
      }
    } catch {/* Older APIs have no Live surface; ordinary chat stays usable. */}
  }
  start():Promise<void> {
    if(this.pending)return this.pending;
    if(this.snapshot.status!=='idle')return Promise.resolve();
    const operation=this.connect();const pending=operation.finally(()=>{if(this.pending===pending)this.pending=undefined;});this.pending=pending;return pending;
  }
  private async connect():Promise<void> {
    const generation=++this.generation;const abort=new AbortController();this.abort=abort;
    this.update({status:'connecting',error:null,transcript:[],muted:false});
    let reserved=false;
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;const peer=new RTCPeerConnection();this.peer=peer;
      this.audio=new Audio();this.audio.autoplay=true;
      peer.ontrack=event=>{if(generation!==this.generation)return;this.audio!.srcObject=new MediaStream([event.track]);void this.play();};
      peer.onconnectionstatechange=()=>{if(generation===this.generation&&['failed','closed'].includes(peer.connectionState)&&this.snapshot.status==='active')void this.stop();};
      stream.getTracks().forEach(track=>{track.enabled=false;peer.addTrack(track,stream);});
      const channel=peer.createDataChannel('oai-events');this.channel=channel;
      channel.onmessage=event=>{if(generation===this.generation)this.receive(event.data);};
      await peer.setLocalDescription(await peer.createOffer());
      await this.gather(peer,abort.signal);
      if(generation!==this.generation)return;
      this.owner={connectionId:crypto.randomUUID(),controlToken:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')};
      reserved=true;
      const result=await this.client.startLiveConnection(this.sessionId,this.owner,peer.localDescription!.sdp,abort.signal);
      if(generation!==this.generation)return;
      this.ownerChanged();
      if(result.connection?.status!=='active'||!result.sdp_answer)throw new Error('Live could not start. Please retry once the connection has closed.');
      this.readiness=setTimeout(()=>{if(generation===this.generation&&this.snapshot.status==='connecting'){this.update({error:'The voice connection timed out. Please try again.'});void this.stop();}},20000);
      await peer.setRemoteDescription({type:'answer',sdp:result.sdp_answer});
      // Stopping while the browser applies SDP must not restart audio or its meter.
      if(generation!==this.generation)return;
      stream.getTracks().forEach(track=>{track.enabled=true;});
      this.meter(stream);
    } catch(error) {
      if(generation!==this.generation)return;
      if(reserved&&this.owner)await this.client.stopLiveConnection(this.sessionId,this.owner).catch(()=>undefined);
      this.cleanup();this.owner=undefined;this.ownerChanged();
      this.update({status:'idle',error:error instanceof DOMException&&error.name==='NotAllowedError'?'Allow microphone access to start Live.':error instanceof Error?error.message:'Live could not connect.'});
      await this.refresh();
    }
  }
  stop():Promise<void> {
    if(this.stopping)return this.stopping;
    this.generation++;this.pending=undefined;this.abort?.abort();this.update({status:'ending'});
    this.stream?.getTracks().forEach(track=>{track.enabled=false;});
    const owner=this.owner;
    this.stopping=(async()=>{
      try {if(owner)await this.client.stopLiveConnection(this.sessionId,owner);}
      catch {this.update({error:'The call is closing. Server recovery will release it if the connection was lost.'});}
      finally {this.cleanup();this.owner=undefined;this.ownerChanged();this.update({status:'idle',amplitude:0,speaking:false,playbackBlocked:false});await this.refresh();this.stopping=undefined;}
    })();return this.stopping;
  }
  setMuted(muted:boolean):void {
    this.stream?.getAudioTracks().forEach(track=>{track.enabled=!muted;});
    if(this.channel?.readyState==='open')this.channel.send(JSON.stringify({type:muted?'session.input_audio.mute':'session.input_audio.unmute',event_id:crypto.randomUUID()}));
    this.update({muted});
  }
  async play():Promise<void> {try{await this.audio?.play();this.update({playbackBlocked:false});}catch{this.update({playbackBlocked:true});}}
  private receive(data:string):void {
    let event:Record<string,unknown>;try{event=JSON.parse(data);}catch{return;}
    if(event.type==='session.started'){clearTimeout(this.readiness);this.update({status:'active'});}
    if(event.type==='error'){this.update({error:'The voice provider reported an error. Please try again.'});void this.stop();}
    if(event.type==='session.closed')void this.stop();
    if((event.type==='session.input_transcript.delta'||event.type==='session.output_transcript.delta')&&typeof event.delta==='string') {
      const role=event.type==='session.input_transcript.delta'?'user':'assistant';
      const transcript=[...this.snapshot.transcript];const last=transcript.at(-1);
      if(last?.role===role)transcript[transcript.length-1]={...last,text:last.text+event.delta};
      else transcript.push({id:String(event.event_id),role,text:event.delta});
      if(role==='assistant')this.lastSpeakerAt=Date.now();
      this.update({transcript:transcript.slice(-2)});
    }
  }
  private gather(peer:RTCPeerConnection,signal:AbortSignal):Promise<void> {
    if(peer.iceGatheringState==='complete')return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const finish=(error?:Error)=>{clearTimeout(timeout);peer.removeEventListener('icegatheringstatechange',changed);signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
      const changed=()=>{if(peer.iceGatheringState==='complete')finish();};const cancel=()=>finish(new Error('Connection cancelled.'));
      const timeout=setTimeout(()=>finish(new Error('WebRTC connection timed out.')),10000);
      peer.addEventListener('icegatheringstatechange',changed);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
    });
  }
  private meter(stream:MediaStream):void {
    if(typeof AudioContext==='undefined')return;
    const context=new AudioContext();this.audioContext=context;
    const analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(stream).connect(analyser);
    const samples=new Uint8Array(256);let last=0;
    const frame=(now:number)=>{if(this.audioContext!==context)return;if(now-last>100){last=now;analyser.getByteTimeDomainData(samples);
      const amplitude=this.snapshot.muted?0:Math.min(1,Math.sqrt(samples.reduce((sum,value)=>sum+((value-128)/128)**2,0)/samples.length)*4);
      this.update({amplitude,speaking:Date.now()-this.lastSpeakerAt<1500});}this.frame=requestAnimationFrame(frame);};
    this.frame=requestAnimationFrame(frame);
  }
  private cleanup():void {
    clearTimeout(this.readiness);
    if(this.frame!==undefined)cancelAnimationFrame(this.frame);void this.audioContext?.close();this.audioContext=undefined;
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=undefined;
    this.channel?.close();this.channel=undefined;this.peer?.close();this.peer=undefined;
    if(this.audio){this.audio.pause();this.audio.srcObject=null;this.audio=undefined;}
  }
  private update(update:Partial<CaltraLiveSnapshot>):void {this.snapshot={...this.snapshot,...update};for(const listener of this.listeners)listener();}
}
