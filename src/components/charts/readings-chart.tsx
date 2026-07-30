"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SERIES } from "@/lib/readings";

type Reading = { label: string; value: number; recordedAt: string };

const COLORS: Record<(typeof SERIES)[number], string> = {
  Revenue: "var(--chart-1)",
  Users: "var(--chart-2)",
};

// Pivot [{label, value, recordedAt}] into [{date, Revenue, Users}] for Recharts.
function pivot(data: Reading[]): Array<Record<string, number | string>> {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const r of data) {
    const date = new Date(r.recordedAt).toISOString().slice(0, 10);
    const row = byDate.get(date) ?? { date };
    row[r.label] = r.value;
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

export function ReadingsChart({ data }: { data: Reading[] }) {
  const rows = pivot(data);
  return (
    <div className="h-72 w-full" data-testid="readings-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
            }}
          />
          <Legend />
          {SERIES.map((label) => (
            <Line
              key={label}
              type="monotone"
              dataKey={label}
              stroke={COLORS[label]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
