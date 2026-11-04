import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_FORMATTING,
  FORMATTING_CATEGORIES,
  type FormattingConfig,
} from "./formattingOptions";

export interface FormattingFieldsProps {
  value: FormattingConfig;
  onChange: (next: FormattingConfig) => void;
  onReset?: () => void;
}

export function FormattingFields({ value, onChange, onReset }: FormattingFieldsProps) {
  const handleSelect = (key: keyof FormattingConfig, next: string) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="flex flex-col gap-3">
      {FORMATTING_CATEGORIES.map((category) => (
        <div key={category.key} className="flex items-center gap-3">
          <div className="flex w-1/2 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{category.label}</span>
              {value[category.key] === DEFAULT_FORMATTING[category.key] && (
                <span className="text-xs text-muted-foreground">Default</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{category.description}</p>
          </div>
          <Select value={value[category.key]} onValueChange={(v) => handleSelect(category.key, v)}>
            <SelectTrigger className="w-1/2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {category.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {option.isDefault ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {onReset && (
        <Button variant="outline" onClick={onReset} className="gap-2 self-start">
          <RotateCcw className="h-4 w-4" />
          Reset to defaults
        </Button>
      )}
    </div>
  );
}

interface FormattingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FormattingConfig;
  onChange: (next: FormattingConfig) => void;
  onReset?: () => void;
}

export function FormattingDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onReset,
}: FormattingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Formatting settings</DialogTitle>
          <DialogDescription>
            Configure how dates, times, numbers, and other formatted content appear in the
            transcript. Changes apply on the next recording session.
          </DialogDescription>
        </DialogHeader>

        <FormattingFields value={value} onChange={onChange} onReset={onReset} />
      </DialogContent>
    </Dialog>
  );
}
