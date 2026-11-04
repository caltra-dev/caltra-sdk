"use client";
import { createContext, useContext, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import type { CaltraLive } from '@caltra/client';
import { AudioLinesIcon } from 'lucide-react';
import { TooltipIconButton } from './upstream/components/assistant-ui/elements/tooltip-icon-button.js';
import { VoiceConversation } from './upstream/components/assistant-ui/elements/voice-conversation.js';
import { Button } from './upstream/components/ui/button.js';

/** Keeps media state outside assistant-ui's mutually exclusive text/voice execution runtime. */
export const CaltraLiveContext=createContext<{live?:CaltraLive;Controls?:ComponentType}>({});

export function CaltraComposerControls() {
  const {live,Controls}=useContext(CaltraLiveContext);
  return <>{Controls&&<Controls/>}{live&&<LiveButton live={live}/>}</>;
}

function LiveButton({live}:{live:CaltraLive}) {
  const state=useSyncExternalStore(live.subscribe,live.getSnapshot,live.getSnapshot);
  if(!state.enabled)return null;
  return <TooltipIconButton type="button" className="ms-auto me-1.5 shrink-0" tooltip={state.elsewhere?'Live is active in another tab':'Start Live'} aria-label="Start Live"
    disabled={state.elsewhere||state.status!=='idle'} onClick={()=>{void live.start();}} variant="ghost" size="icon">
    <AudioLinesIcon className="size-4"/>
  </TooltipIconButton>;
}

export function CaltraConversation({children}:{children:ReactNode}) {
  const {live}=useContext(CaltraLiveContext);
  return live?<LiveConversation live={live}>{children}</LiveConversation>:children;
}

function LiveConversation({live,children}:{live:CaltraLive;children:ReactNode}) {
  const state=useSyncExternalStore(live.subscribe,live.getSnapshot,live.getSnapshot);
  // Keep the native thread mounted so switching presentation retains its draft and viewport.
  return <><LivePanel live={live}/><div className="caltra-chat__text-view" hidden={state.status!=='idle'}>{children}</div></>;
}

function LivePanel({live}:{live:CaltraLive}) {
  const state=useSyncExternalStore(live.subscribe,live.getSnapshot,live.getSnapshot);
  return <>
    {state.elsewhere&&<div className="caltra-chat__connection" role="status">Live is active in another tab.</div>}
    {state.error&&<div className="caltra-chat__connection" role="alert">{state.error}</div>}
    {state.status==='ending'&&<div className="caltra-chat__connection" role="status">Ending call…</div>}
    {state.status!=='idle'&&state.status!=='ending'&&<VoiceConversation mode={state.status==='active'?(state.speaking?'speaking':'listening'):'connecting'}
        showStatusText={false} fullSize
        amplitude={state.amplitude} transcript={state.transcript} muted={state.muted}
        onToggleMute={state.status==='active'?()=>live.setMuted(!state.muted):undefined}
        onEnd={()=>{void live.stop();}}/>}
    {state.playbackBlocked&&<Button onClick={()=>{void live.play();}}>Enable voice playback</Button>}
  </>;
}
