import "./globals.css";
import { ReactNode } from "react";
import AuthProviders from "@/components/AuthProviders"; // <--- Import your new client component

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Wrap children with the client-side SessionProvider wrapper */}
        <AuthProviders>{children}</AuthProviders>
      </body>
    </html>
  );
}