import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Landing from "@/app/page";

test("landing page shows the app name", () => {
  render(<Landing />);
  expect(
    screen.getByRole("heading", { name: /hackathon starter/i }),
  ).toBeInTheDocument();
});
