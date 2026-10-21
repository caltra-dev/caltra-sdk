// Adapted from assistant-ui 75e3ef71, MIT. See README.md.
"use client";

import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import type { CaltraComposerProps } from "../chat.js";
import { Button } from "./button.js";
import { TooltipIconButton } from "./tooltip-icon-button.js";

/** Upstream text composer; attachment and dictation adapters are not supported. */
export function Composer({ labels, submitMode, inputProps }: CaltraComposerProps) {
  return <ComposerPrimitive.Root className="aui-composer-root caltra-chat__composer relative flex w-full flex-col">
    <div data-slot="aui_composer-shell" className="flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color]">
      <ComposerPrimitive.Input
        placeholder={labels.placeholder} aria-label={labels.messageInput}
        rows={1} autoFocus enterKeyHint="send" submitMode={submitMode}
        {...inputProps}
        className={`aui-composer-input caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 outline-none${inputProps?.className ? ` ${inputProps.className}` : ""}`}
      />
      <div className="aui-composer-action-wrapper relative flex items-center justify-between">
        <div className="aui-composer-actions flex items-center gap-1.5">
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton tooltip={labels.send} side="bottom" type="button" variant="default" size="icon"
                className="aui-composer-send size-7 rounded-full" aria-label={labels.send}>
                <ArrowUpIcon className="aui-composer-send-icon size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <Button type="button" variant="default" size="icon" className="aui-composer-cancel size-7 rounded-full"
                aria-label={labels.stop ?? "Stop generating"}>
                <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
              </Button>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
    </div>
  </ComposerPrimitive.Root>;
}
