import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { signOut } from "next-auth/react";
import { AppNav } from "@/components/nav/app-nav";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

const mockSignOut = vi.mocked(signOut);

test("renders nav links, email, and marks the active link", () => {
  render(<AppNav email="user@example.com" />);
  expect(screen.getByRole("link", { name: /^dashboard$/i })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: /^chat$/i })).not.toHaveAttribute(
    "aria-current",
  );
  expect(screen.getByText("user@example.com")).toBeInTheDocument();
});

test("Sign out calls signOut with a callback to /signin", async () => {
  const user = userEvent.setup();
  render(<AppNav email="user@example.com" />);
  await user.click(screen.getByRole("button", { name: /sign out/i }));
  expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/signin" });
});
