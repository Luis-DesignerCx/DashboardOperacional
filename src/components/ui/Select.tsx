"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Select({ value, onValueChange, options, placeholder, className, disabled }: SelectProps) {
  return (
    <RadixSelect.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        className={
          "flex items-center justify-between gap-2 bg-surface-1 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 disabled:opacity-50 disabled:cursor-not-allowed data-[placeholder]:text-slate-500 " +
          (className ?? "")
        }
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown size={14} className="text-slate-400" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden bg-surface-2 border border-white/[0.08] rounded-xl shadow-xl shadow-black/40 w-[var(--radix-select-trigger-width)]"
        >
          <RadixSelect.Viewport className="p-1 max-h-64">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-slate-200 outline-none cursor-pointer select-none data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white data-[state=checked]:text-gr-300 data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Check size={14} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
