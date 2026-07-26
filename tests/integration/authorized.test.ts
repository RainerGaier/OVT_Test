import { expect, test } from "vitest";
import authConfig from "@/lib/auth.config";

function check(pathname: string, loggedIn: boolean) {
  return authConfig.callbacks!.authorized!({
    auth: loggedIn ? ({ user: { id: "u1" } } as never) : null,
    request: { nextUrl: new URL(`http://localhost${pathname}`) } as never,
  } as never);
}

test("unauthenticated users are blocked from /dashboard", () => {
  expect(check("/dashboard", false)).toBe(false);
});

test("unauthenticated users are blocked from /chat", () => {
  expect(check("/chat", false)).toBe(false);
});

test("authenticated users may access /dashboard", () => {
  expect(check("/dashboard", true)).toBe(true);
});

test("public routes are always allowed", () => {
  expect(check("/", false)).toBe(true);
  expect(check("/signin", false)).toBe(true);
});
