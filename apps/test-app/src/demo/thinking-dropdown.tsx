import { ChevronDownIcon } from "lucide-react";
import { useModelSelectorEfforts } from "../upstream/components/assistant-ui/elements/model-selector.aui.js";
import { Button } from "../upstream/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../upstream/components/ui/dropdown-menu.js";

/** Upstream's documented effort-menu composition supports catalogs with many levels. */
export function ThinkingDropdown() {
  const { efforts, effort, setEffort } = useModelSelectorEfforts();
  if (!efforts?.length) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
      <span className="text-muted-foreground text-xs">Thinking</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Thinking"
          render={<Button variant="ghost" size="sm" />}
          onKeyDown={event => event.stopPropagation()}
        >
          {efforts.find(option => option.id === effort)?.name ?? "Select"}
          <ChevronDownIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        {/* Keep menu keys out of the surrounding cmdk model list. */}
        <DropdownMenuContent align="end" onKeyDown={event => event.stopPropagation()}>
          <DropdownMenuRadioGroup value={effort ?? ""} onValueChange={setEffort} aria-label="Thinking">
            {efforts.map(option => (
              <DropdownMenuRadioItem key={option.id} value={option.id}>
                {option.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
