import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

export const { auth: proxy } = NextAuth(authConfig);
export default proxy;

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
