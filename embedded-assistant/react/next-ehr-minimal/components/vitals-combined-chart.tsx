"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { SectionCard } from "@/components/ui";
import type { VitalsPayload } from "@/lib/ehr-types";

type VitalsPoint = {
  date: string;
  vitals: VitalsPayload;
};

type MetricKey =
  | "systolic"
  | "diastolic"
  | "heartRate"
  | "temperatureC"
  | "oxygenSaturation"
  | "respiratoryRate";

const metrics: Array<{
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  normalize: (value: number) => number;
}> = [
  {
    key: "systolic",
    label: "Systolic",
    unit: "mmHg",
    color: "#e11d48",
    normalize: (value) => scale(value, 80, 180),
  },
  {
    key: "diastolic",
    label: "Diastolic",
    unit: "mmHg",
    color: "#f97316",
    normalize: (value) => scale(value, 45, 110),
  },
  {
    key: "heartRate",
    label: "Heart rate",
    unit: "bpm",
    color: "#0284c7",
    normalize: (value) => scale(value, 45, 130),
  },
  {
    key: "temperatureC",
    label: "Temp",
    unit: "C",
    color: "#ca8a04",
    normalize: (value) => scale(value, 35.5, 39.5),
  },
  {
    key: "oxygenSaturation",
    label: "SpO2",
    unit: "%",
    color: "#059669",
    normalize: (value) => scale(value, 88, 100),
  },
  {
    key: "respiratoryRate",
    label: "Resp rate",
    unit: "/min",
    color: "#7c3aed",
    normalize: (value) => scale(value, 8, 28),
  },
];

function scale(value: number, min: number, max: number) {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function metricValue(vitals: VitalsPayload, key: MetricKey) {
  return vitals[key];
}

function formatMetricValue(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

export function VitalsCombinedChart({
  description,
  points,
}: {
  description: string;
  points: VitalsPoint[];
}) {
  const sorted = [...points].sort(
    (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
  );
  const [activeIndex, setActiveIndex] = useState(sorted.length - 1);
  const activePoint = sorted[activeIndex] ?? sorted.at(-1);
  const plotLeft = 7;
  const plotRight = 96;
  const plotTop = 12;
  const plotBottom = 74;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  function xForIndex(index: number) {
    return sorted.length === 1
      ? (plotLeft + plotRight) / 2
      : plotLeft + (index / (sorted.length - 1)) * plotWidth;
  }

  function yForMetric(value: number, key: MetricKey) {
    const metric = metrics.find((entry) => entry.key === key)!;
    return plotBottom - metric.normalize(value) * plotHeight;
  }

  return (
    <SectionCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Activity size={18} className="mt-1" />
          <div>
            <h2 className="text-lg font-bold">Vitals timeline</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {description}
            </p>
          </div>
        </div>
        {activePoint ? (
          <div className="rounded-lg border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm">
            <p className="font-semibold">{formatFullDate(activePoint.date)}</p>
            <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {metrics.map((metric) => {
                const value = metricValue(activePoint.vitals, metric.key);

                if (value === undefined) {
                  return null;
                }

                return (
                  <div key={metric.key} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: metric.color }}
                    />
                    <span className="text-[hsl(var(--muted-foreground))]">
                      {metric.label}
                    </span>
                    <span className="font-mono-data font-semibold">
                      {formatMetricValue(value, metric.unit)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox="0 0 104 86"
          className="h-80 min-w-[42rem] w-full overflow-visible"
          role="img"
          aria-label="Combined vitals chart"
        >
          {[plotTop, (plotTop + plotBottom) / 2, plotBottom].map((y) => (
            <line
              key={y}
              x1={plotLeft}
              x2={plotRight}
              y1={y}
              y2={y}
              stroke="hsl(var(--border))"
              strokeWidth="0.4"
            />
          ))}
          {sorted.map((point, index) => {
            const x = xForIndex(index);
            const isActive = index === activeIndex;

            return (
              <g
                key={point.date}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                tabIndex={0}
                role="button"
                aria-label={`Vitals for ${formatFullDate(point.date)}`}
                className="cursor-pointer outline-none"
              >
                <line
                  x1={x}
                  x2={x}
                  y1={plotTop}
                  y2={plotBottom}
                  stroke={isActive ? "hsl(var(--foreground))" : "hsl(var(--border))"}
                  strokeWidth={isActive ? "0.9" : "0.45"}
                  strokeDasharray="1.5 1.5"
                />
                {metrics.map((metric) => {
                  const value = metricValue(point.vitals, metric.key);

                  if (value === undefined) {
                    return null;
                  }

                  const y = yForMetric(value, metric.key);

                  return (
                    <g key={metric.key}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isActive ? 2.2 : 1.8}
                        fill={metric.color}
                        stroke="white"
                        strokeWidth="0.7"
                      />
                      <text
                        x={x + 1.8}
                        y={y - 1.4}
                        fontSize="3"
                        fill="hsl(var(--foreground))"
                      >
                        {formatMetricValue(value, metric.unit)}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={x}
                  y={82}
                  textAnchor="middle"
                  fontSize="3.2"
                  fill="hsl(var(--muted-foreground))"
                >
                  {formatDate(point.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {metrics.map((metric) => (
          <span key={metric.key} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: metric.color }}
            />
            {metric.label}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}