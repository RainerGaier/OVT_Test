import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ReadingsPanel } from "@/components/charts/readings-panel";

vi.mock("@/components/charts/readings-chart", () => ({
  ReadingsChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="chart-stub">{data.length} points</div>
  ),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

test("shows the empty state and loads sample data on click", async () => {
  const user = userEvent.setup();
  // First GET: empty. POST sample. Refetch GET: one point.
  fetchMock
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse({ count: 180 }, 201))
    .mockResolvedValueOnce(
      jsonResponse([{ label: "Revenue", value: 1, recordedAt: "2026-07-30" }]),
    );

  render(<ReadingsPanel />);
  const loadBtn = await screen.findByRole("button", { name: /load sample data/i });
  await user.click(loadBtn);

  await waitFor(() => expect(screen.getByTestId("chart-stub")).toBeInTheDocument());
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/readings/sample", {
    method: "POST",
  });
});

test("changing the range refetches with the selected days", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValue(
    jsonResponse([{ label: "Revenue", value: 1, recordedAt: "2026-07-30" }]),
  );

  render(<ReadingsPanel />);
  await screen.findByTestId("chart-stub");
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/readings?days=30");

  await user.click(screen.getByRole("button", { name: /^7d$/i }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith("/api/readings?days=7"),
  );
});
