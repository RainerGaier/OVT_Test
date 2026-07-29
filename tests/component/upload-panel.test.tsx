import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { UploadPanel, type UiUpload } from "@/components/upload/upload-panel";

afterEach(() => vi.unstubAllGlobals());

const uploads: UiUpload[] = [
  {
    id: "1",
    filename: "photo.png",
    url: "https://blob/photo.png",
    contentType: "image/png",
    size: 2048,
    createdAt: "2026-07-29T00:00:00.000Z",
  },
  {
    id: "2",
    filename: "data.csv",
    url: "https://blob/data.csv",
    contentType: "text/csv",
    size: 512,
    createdAt: "2026-07-29T00:00:00.000Z",
  },
];

test("lists uploads with an image thumbnail for image types only", () => {
  render(<UploadPanel initialUploads={uploads} />);
  expect(screen.getByText("photo.png")).toBeInTheDocument();
  expect(screen.getByText("data.csv")).toBeInTheDocument();
  const thumbs = screen.getAllByRole("img");
  expect(thumbs).toHaveLength(1);
  expect(thumbs[0]).toHaveAttribute("src", "https://blob/photo.png");
});

test("delete calls DELETE for the right id and refreshes", async () => {
  const fetchMock = vi
    .fn()
    // DELETE
    .mockResolvedValueOnce({ ok: true })
    // refresh GET
    .mockResolvedValueOnce({ ok: true, json: async () => [uploads[1]] });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<UploadPanel initialUploads={uploads} />);

  await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);
  expect(fetchMock).toHaveBeenCalledWith("/api/uploads/1", { method: "DELETE" });
});
