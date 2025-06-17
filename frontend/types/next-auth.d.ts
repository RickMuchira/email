// /home/rick110/RickDrive/email_automation/frontend/types/next-auth.d.ts or wherever you keep it

import NextAuth, { DefaultSession, DefaultUser } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    error?: "RefreshAccessTokenError";
    user?: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
    } & DefaultSession["user"]; // Merge with default user properties
  }

  interface User extends DefaultUser {
    // Add custom properties to User if needed
  }
}

declare module "next-auth/jwt" {
  /**
   * Returned by the `jwt` callback and `getToken`, when using JWT sessions
   */
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    user?: DefaultUser;
    error?: "RefreshAccessTokenError";
  }
}