/**
 * A custom dropdown (listbox) for the mock form. Native <select> can't be opened
 * programmatically or have an option picked-by-index reliably, so a voice command
 * ("go to severity" → open, "option 2" → pick) needs a control we drive
 * imperatively. Trigger button + popover list, open state owned here, exposed via
 * an imperative handle so the applet's command handlers can open/pick.
 */
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../_shared/utils";

export interface DropdownHandle {
  /** Focus the trigger (without opening). */
  focus(): void;
  /** Focus + open the list. */
  open(): void;
  close(): void;
  /** Select the Nth option (1-based). Returns false if out of range. */
  pick(index: number): boolean;
}

export const Dropdown = forwardRef(function Dropdown(
  {
    label,
    options,
    value,
    onChange,
  }: {
    label: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
  },
  ref: Ref<DropdownHandle>,
) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => triggerRef.current?.focus(),
    open: () => {
      triggerRef.current?.focus();
      setOpen(true);
    },
    close: () => setOpen(false),
    pick: (index: number) => {
      const option = options[index - 1];
      if (option === undefined) return false;
      onChange(option);
      setOpen(false);
      return true;
    },
  }));

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground outline-none focus:border-corti-lime focus:ring-1 focus:ring-corti-lime"
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {value || `Select ${label}…`}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-md"
        >
          {options.map((option, i) => (
            <li key={option} role="option" aria-selected={option === value}>
              {/* onMouseDown so the trigger's onBlur doesn't close before select */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(option);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
              >
                <span>
                  <span className="mr-2 text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  {option}
                </span>
                {option === value && (
                  <Check className="h-4 w-4 text-corti-lime" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
