import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SignInForm } from "@/components/signin-form";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

test("signin form renders email and password fields", () => {
  render(<SignInForm />);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});
