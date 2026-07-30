import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme }),
}));

test("renders a toggle button and switches light → dark", async () => {
  const user = userEvent.setup();
  render(<ThemeToggle />);
  const btn = screen.getByRole("button", { name: /toggle theme/i });
  await user.click(btn);
  expect(setTheme).toHaveBeenCalledWith("dark");
});
