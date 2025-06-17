// File: frontend/components/SendTokenToBackend.tsx
"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

export default function SendTokenToBackend() {
  const { data: session, status } = useSession(); // ✅ ADDED: status

  useEffect(() => {
    // ✅ IMPROVED: Check for authenticated status
    if (status === "authenticated" && session?.accessToken) {
      console.log("Attempting to send token to backend...");
      fetch("http://localhost:8000/api/store-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: session.accessToken,
          // ✅ ADDED: Sending refresh_token and user_email
          refresh_token: session.refreshToken,
          user_email: session.user?.email,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            return res.text().then(text => { throw new Error(`HTTP error! status: ${res.status}, body: ${text}`); });
          }
          return res.json();
        })
        .then((data) => console.log("✅ Token sent to backend:", data))
        .catch((err) => console.error("❌ Error sending token:", err));
    } else if (status === "unauthenticated") {
        console.log("User is unauthenticated, not sending token to backend.");
    } else if (status === "loading") {
        console.log("Session is loading, waiting to send token to backend.");
    }
  }, [session, status]); // ✅ ADDED: status to dependency array

  return <p>Token has been sent to the backend (check console).</p>;
}