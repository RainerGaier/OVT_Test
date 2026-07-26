import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { signIn } from "next-auth/react";
import { SignInForm } from "@/components/signin-form";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const mockSignIn = vi.mocked(signIn);

// signin-form navigates via window.location.href on success; jsdom's real
// location can't be assigned, so swap in a writable stub per test.
const realLocation = window.location;
beforeEach(() => {
  mockSignIn.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "" },
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

test("signin form renders email and password fields", () => {
  render(<SignInForm />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("redirects to /dashboard on successful sign in", async () => {
  mockSignIn.mockResolvedValueOnce({ error: null } as never);
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText(/email/i), "a@example.com");
  await user.type(screen.getByLabelText(/password/i), "password-123");
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(mockSignIn).toHaveBeenCalledWith("credentials", {
    email: "a@example.com",
    password: "password-123",
    redirect: false,
  });
  await waitFor(() => expect(window.location.href).toBe("/dashboard"));
});

test("shows an error message when credentials are rejected", async () => {
  mockSignIn.mockResolvedValueOnce({ error: "CredentialsSignin" } as never);
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText(/email/i), "a@example.com");
  await user.type(screen.getByLabelText(/password/i), "wrong");
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(
    await screen.findByText(/invalid email or password/i),
  ).toBeInTheDocument();
  expect(window.location.href).toBe("");
});
