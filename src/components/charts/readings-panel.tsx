"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VALID_RANGES, type RangeDays } from "@/lib/readings";
import { ReadingsChart } from "@/components/charts/readings-chart";

type Reading = { label: string; value: number; recordedAt: string };

export function ReadingsPanel() {
  const [days, setDays] = useState<RangeDays>(30);
  const [data, setData] = useState<Reading[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: RangeDays) => {
    try {
      const res = await fetch(`/api/readings?days=${range}`);
      if (res.ok) {
        setData((await res.json()) as Reading[]);
        setError(null);
      } else {
        setError("Couldn't load trends.");
      }
    } catch {
      setError("Couldn't load trends.");
    }
  }, []);

  useEffect(() => {
    // Standard data-fetching-in-effect pattern: `load` awaits the fetch
    // before calling setData, so nothing setStates synchronously during the
    // effect itself. See theme-toggle.tsx for the same precedent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(days);
  }, [days, load]);

  async function loadSample() {
    setLoading(true);
    try {
      const res = await fetch("/api/readings/sample", { method: "POST" });
      if (!res.ok) {
        setError("Couldn't load sample data.");
        return;
      }
      await load(days);
    } catch {
      setError("Couldn't load sample data.");
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button
          onClick={() => {
            setError(null);
            void load(days);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (data === null) {
    return <p className="text-muted-foreground text-sm">Loading trends…</p>;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
        <p className="text-muted-foreground text-sm">
          No readings yet. Load a sample dataset to see the chart.
        </p>
        <Button onClick={loadSample} disabled={loading}>
          {loading ? "Loading…" : "Load sample data"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1" role="group" aria-label="Date range">
        {VALID_RANGES.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={r === days ? "default" : "outline"}
            aria-pressed={r === days}
            onClick={() => setDays(r)}
          >
            {r}d
          </Button>
        ))}
      </div>
      <ReadingsChart data={data} />
    </div>
  );
}
