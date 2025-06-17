"use client"; // <--- VERY IMPORTANT: This makes it a Client Component

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

interface AuthProvidersProps {
  children: ReactNode;
}

export default function AuthProviders({ children }: AuthProvidersProps) {
  return <SessionProvider>{children}</SessionProvider>;
}