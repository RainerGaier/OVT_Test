import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
// import GitHub from "next-auth/providers/github"; // enable social login on the day
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import authConfig from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authorizeCredentials(input: {
  email: unknown;
  password: unknown;
}): Promise<User | null> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  return ok ? user : null;
}

export async function registerUser(input: {
  email: unknown;
  password: unknown;
}): Promise<{ id: string; email: string }> {
  const parsed = credentialsSchema.parse(input); // throws ZodError on invalid input
  const existing = await prisma.user.findUnique({
    where: { email: parsed.email },
  });
  if (existing) throw new Error("Email already registered");
  const user = await prisma.user.create({
    data: {
      email: parsed.email,
      passwordHash: await hashPassword(parsed.password),
    },
  });
  return { id: user.id, email: user.email };
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) =>
        authorizeCredentials({ email: creds?.email, password: creds?.password }),
    }),
    // GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET }),
  ],
});
