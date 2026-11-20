"use client";

import { useId, type ComponentProps } from "react";
import { MicIcon, MicOffIcon, PhoneOffIcon } from "lucide-react";
import { cn } from "../../../lib/utils.js";
import { ghostButton, mono, paper } from "./surfaces.js";
import { clamp } from "../utils/range.js";

export type VoiceMode = "connecting" | "listening" | "thinking" | "speaking";

export interface VoiceTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const CAPTION: Record<VoiceMode, string> = {
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const HINT: Record<VoiceMode, string> = {
  connecting: "Opening the mic",
  listening: "Listening for you",
  thinking: "Working on it",
  speaking: "Playing the reply",
};

export function VoiceConversation({
  mode,
  amplitude,
  transcript,
  muted,
  onToggleMute,
  onInterrupt,
  onEnd,
  showStatusText = true,
  layout = "card",
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "mode"
  | "amplitude"
  | "transcript"
  | "muted"
  | "onToggleMute"
  | "onInterrupt"
  | "onEnd"
> & {
  mode: VoiceMode;
  amplitude: number;
  transcript: readonly VoiceTurn[];
  muted?: boolean;
  onToggleMute?: () => void;
  onInterrupt?: () => void;
  onEnd?: () => void;
  /** Keep the status accessible while allowing a dot-only visual presentation. */
  showStatusText?: boolean;
  /** The compact composer layout shares the existing chat transcript. */
  layout?: "card" | "composer";
}) {
  const compact = layout === "composer";
  const smokeFilter = useId();
  const level = clamp(amplitude, 0, 1);
  const active = mode === "listening" || mode === "speaking";
  const canInterrupt = mode === "speaking" && onInterrupt !== undefined;

  return (
    <div
      data-slot="voice-conversation"
      className={cn(
        compact
          ? "flex w-full shrink-0 items-center justify-center gap-3"
          : cn(paper, "flex w-full max-w-xs flex-col items-center gap-4 rounded-[28px] px-5 py-5"),
        className,
      )}

      {...props}
    >
      {compact ? (
        <span className="caltra-voice-signal" data-mode={mode} data-muted={muted || undefined} aria-hidden="true">
          <span className="caltra-voice-signal__body" style={{ transform: `scale(${0.63 + (active ? Math.sqrt(level) * 0.37 : 0)})` }}>
            <svg viewBox="0 0 64 64" focusable="false">
              <defs>
                <filter id={smokeFilter} x="-25%" y="-25%" width="150%" height="150%">
                  <feTurbulence type="fractalNoise" baseFrequency=".048" numOctaves="3" seed="7" result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
                  <feGaussianBlur stdDeviation=".75" />
                </filter>
              </defs>
              <g filter={`url(#${smokeFilter})`} fill="none">
                <g className="caltra-voice-signal__plume">
                  <path d="M-8 56 C14 55 54 45 28 31 S24 12 60 1" stroke="#41e4c2" strokeWidth="9" opacity=".75" />
                  <path d="M-6 60 C19 49 50 46 27 30 S26 10 63 -2" stroke="#c2fff0" strokeWidth="2.6" />
                </g>
                <g className="caltra-voice-signal__wisp">
                  <path d="M13 75 C48 50 11 37 37 26 S57 11 50 -8" stroke="#9f91fb" strokeWidth="6" opacity=".85" />
                  <path d="M10 75 C51 48 14 37 39 26 S60 10 50 -8" stroke="#e1dfff" strokeWidth="1.6" />
                </g>
              </g>
            </svg>
          </span>
        </span>
      ) : (
        <button
          type="button"
          onClick={onInterrupt}
          disabled={!canInterrupt}
          aria-label="Interrupt the assistant"
          data-mode={mode}
          data-muted={muted || undefined}
          className="focus-visible:ring-foreground/20 relative flex size-24 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-1 disabled:cursor-default"
        >
          <span
            aria-hidden
            className={cn(
              "absolute rounded-full transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
              mode === "speaking"
                ? "bg-blue-500/12 dark:bg-blue-400/15"
                : "bg-foreground/[0.05]",
          )}
          style={{
            width: "6rem",
            height: "6rem",
            transform: `scale(${active ? 0.72 + level * 0.28 : 0.62})`,
            opacity: active ? 1 : 0.5,
          }}
        />
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none",
            mode === "speaking"
              ? "bg-blue-500/20 dark:bg-blue-400/25"
              : "bg-foreground/[0.08]",
          )}
          style={{
            width: "4.25rem",
            height: "4.25rem",
            transform: `scale(${active ? 0.8 + level * 0.22 : 0.7})`,
          }}
        />
        <span
          aria-hidden
          className={cn(
            "relative rounded-full transition-[transform,background-color] duration-150 ease-out motion-reduce:transition-none",
            "size-10",
            mode === "connecting" && "bg-foreground/20 animate-pulse",
            mode === "listening" && "bg-foreground/80",
            mode === "thinking" && "bg-foreground/30 animate-pulse",
            mode === "speaking" && "bg-blue-500 dark:bg-blue-400",
          )}
          style={{ transform: `scale(${active ? 0.9 + level * 0.2 : 0.85})` }}
        />
      </button>
      )}

      <div className={showStatusText ? "flex flex-col items-center gap-1" : "sr-only"} role="status">
        <span className="text-[13.5px] font-medium">{!showStatusText && muted ? "Microphone muted" : CAPTION[mode]}</span>
        {showStatusText && <span className={cn(mono, "text-muted-foreground")}>
          {muted ? "Mic off" : canInterrupt ? "Tap to interrupt" : HINT[mode]}
        </span>}
      </div>

      {!compact && <div className="flex min-h-[4.5rem] w-full flex-col gap-1.5">
        {transcript.map((turn) => (
          <div
            key={turn.id}
            className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex gap-2 text-xs leading-relaxed duration-300"
          >
            <span
              className={cn(
                mono,
                "w-8 shrink-0",
                turn.role === "user"
                  ? "text-muted-foreground"
                  : "text-blue-500/70 dark:text-blue-400/70",
              )}
            >
              {turn.role === "user" ? "you" : "ai"}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 break-words",
                turn.role === "user"
                  ? "text-muted-foreground"
                  : "text-foreground/80",
              )}
            >
              {turn.text}
            </span>
          </div>
        ))}
      </div>}

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={
            muted ? "Turn the microphone on" : "Turn the microphone off"
          }
          aria-pressed={muted}
          onClick={onToggleMute}
          disabled={!onToggleMute}
          className={cn(
            ghostButton,
            "disabled:pointer-events-none disabled:opacity-30",
            compact ? "size-11" : "size-10",
            muted && "bg-foreground/[0.08] text-foreground/90",
          )}
        >
          {muted ? (
            <MicOffIcon className={compact ? "size-5" : "size-4"} />
          ) : (
            <MicIcon className={compact ? "size-5" : "size-4"} />
          )}
        </button>
        <button
          type="button"
          aria-label="End the call"
          onClick={onEnd}
          disabled={!onEnd}
          className={cn("flex items-center justify-center rounded-full bg-red-500/90 text-white transition-[opacity,scale] duration-150 hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none", compact ? "size-11" : "size-10")}
        >
          <PhoneOffIcon className={compact ? "size-5" : "size-4"} />
        </button>
      </div>
    </div>
  );
}
