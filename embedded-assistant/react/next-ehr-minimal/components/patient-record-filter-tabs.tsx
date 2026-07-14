"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Baby,
  Beaker,
  BookOpenText,
  ClipboardCheck,
  ClipboardList,
  Crosshair,
  FileText,
  HeartPulse,
  MessageSquareText,
  Pill,
  Ruler,
  Send,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { RecordEntryType } from "@/lib/ehr-types";

type FilterTabType = RecordEntryType | "all";

export type PatientRecordFilterTabItem = {
  active: boolean;
  className: string;
  count: number;
  href: string;
  iconClassName: string;
  label: string;
  type: FilterTabType;
};

const filterIcons: Record<FilterTabType, LucideIcon> = {
  all: ClipboardList,
  "body-metrics": Ruler,
  "care-plan": ClipboardList,
  diagnosis: Crosshair,
  document: FileText,
  examination: ClipboardCheck,
  history: BookOpenText,
  "lab-result": Beaker,
  maternity: Baby,
  medication: Pill,
  "patient-message": MessageSquareText,
  referral: Send,
  "test-order": Beaker,
  vaccination: Syringe,
  vitals: HeartPulse,
};

export function PatientRecordFilterTabs({
  tabs,
}: {
  tabs: PatientRecordFilterTabItem[];
}) {
  return (
    <Tooltip.Provider delayDuration={120} skipDelayDuration={80}>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1.5">
        {tabs.map((tab) => {
          const Icon = filterIcons[tab.type];

          return (
            <Tooltip.Root key={tab.type}>
              <Tooltip.Trigger asChild>
                <Link
                  href={tab.href}
                  aria-current={tab.active ? "page" : undefined}
                  aria-label={`${tab.label}: ${tab.count}`}
                  className={tab.className}
                >
                  <Icon
                    aria-hidden="true"
                    className={tab.iconClassName}
                    size={18}
                    strokeWidth={2.2}
                  />
                </Link>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="top"
                  align="center"
                  sideOffset={8}
                  className="z-50 rounded-md border border-[hsl(var(--foreground)/0.12)] bg-[hsl(var(--foreground))] px-2.5 py-1.5 text-[hsl(var(--background))] shadow-lg shadow-black/15"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold">{tab.label}</span>
                    <span className="font-mono-data rounded bg-[hsl(var(--background)/0.14)] px-1.5 py-0.5 text-[11px] leading-none">
                      {tab.count}
                    </span>
                  </div>
                  <Tooltip.Arrow className="fill-[hsl(var(--foreground))]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </div>
    </Tooltip.Provider>
  );
}