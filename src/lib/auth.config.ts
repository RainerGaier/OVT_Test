import type { NextAuthConfig } from "next-auth";

// Edge-safe: no Prisma, no argon2. Drives middleware route protection.
export const authConfig = {
  pages: {
    signIn: "/signin",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isProtected =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/chat");
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
