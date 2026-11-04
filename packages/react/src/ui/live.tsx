"use client";
import { createContext, useContext, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import type { CaltraLive } from '@caltra/client';
import { AudioLinesIcon, LoaderCircleIcon } from 'lucide-react';
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
  const connecting=state.status==='connecting';
  const ending=state.status==='ending';
  return <TooltipIconButton type="button" className="ms-auto me-1.5 shrink-0" tooltip={state.elsewhere?'Live is active in another tab':ending?'Ending Live call':connecting?'Cancel Live connection':'Start Live'} aria-label={ending?'Ending Live call':connecting?'Cancel Live connection':'Start Live'} aria-busy={connecting||ending}
    disabled={state.elsewhere||state.status==='active'||state.status==='ending'} onClick={()=>{void (connecting?live.stop():live.start());}} variant="ghost" size="icon">
    {connecting||ending?<LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none"/>:<AudioLinesIcon className="size-4"/>}
  </TooltipIconButton>;
}

export function CaltraConversation({children}:{children:ReactNode}) {
  const {live}=useContext(CaltraLiveContext);
  // Voice controls are outside the native transcript scrollport; the thread always stays mounted.
  return <>{live&&<LivePanel live={live}/>}{children}</>;
}

function LivePanel({live}:{live:CaltraLive}) {
  const state=useSyncExternalStore(live.subscribe,live.getSnapshot,live.getSnapshot);
  return <>
    {state.elsewhere&&<div className="caltra-chat__connection" role="status">Live is active in another tab.</div>}
    {state.error&&<div className="caltra-chat__connection" role="alert">{state.error}</div>}
    {(state.status==='connecting'||state.status==='active')&&<VoiceConversation mode={state.status==='active'?(state.speaking?'speaking':'listening'):'connecting'}
        showStatusText={false} layout="header"
        amplitude={state.amplitude} transcript={state.transcript} muted={state.muted}
        onToggleMute={state.status==='active'?()=>live.setMuted(!state.muted):undefined}
        onEnd={()=>{void live.stop();}}/>}
    {state.playbackBlocked&&<Button onClick={()=>{void live.play();}}>Enable voice playback</Button>}
  </>;
}
