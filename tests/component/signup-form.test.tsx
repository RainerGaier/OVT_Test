import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SignUpForm } from "@/components/signup-form";

// signup-form posts to /api/signup via fetch and navigates on success; stub
// both fetch and window.location per test.
const realLocation = window.location;
beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "" },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

test("signup form renders email and password fields", () => {
  render(<SignUpForm />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
});

test("posts to /api/signup and redirects to /signin on success", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText(/email/i), "new@example.com");
  await user.type(screen.getByLabelText(/password/i), "password-123");
  await user.click(screen.getByRole("button", { name: /sign up/i }));

  expect(fetchMock).toHaveBeenCalledWith("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "new@example.com",
      password: "password-123",
    }),
  });
  await waitFor(() => expect(window.location.href).toBe("/signin"));
});

test("shows the server error message when signup fails", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: "Email already registered" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText(/email/i), "dupe@example.com");
  await user.type(screen.getByLabelText(/password/i), "password-123");
  await user.click(screen.getByRole("button", { name: /sign up/i }));

  expect(
    await screen.findByText(/email already registered/i),
  ).toBeInTheDocument();
  expect(window.location.href).toBe("");
});
