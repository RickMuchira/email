"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Updated Email Interface for this list page
// Removed sentiment and suggested_reply_body as they are not used/provided here
interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  reply_status: string;
  // full_body is not displayed on this list page, so it's optional but good to acknowledge
  full_body?: string;
}

export default function EmailPage() {
  const { data: session, status } = useSession();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchEmails = useCallback(async (fetchNew: boolean = false) => {
    // Only proceed if session is authenticated
    if (status === "loading" || !session?.accessToken || !session.user?.email) {
      // Don't set error immediately, let useEffect handle redirection
      if (status === "unauthenticated") {
        router.push('/api/auth/signin');
      }
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(
        `http://localhost:8000/api/read-emails?fetch_new=${fetchNew}&limit=20`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.accessToken,
            // refresh_token is not needed for this specific endpoint on the backend
            user_email: session.user.email,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        // Handle authentication errors specifically
        if (res.status === 401) {
          setError("Session expired. Please sign in again.");
          router.push('/api/auth/signin'); // Redirect to sign-in on auth failure
          return;
        }
        throw new Error(errData.detail || `HTTP error! Status: ${res.status}`);
      }

      const data = await res.json();
      // Ensure data.emails is an array before setting state
      setEmails(Array.isArray(data.emails) ? data.emails : []);
    } catch (err: any) {
      setError(`Failed to fetch emails: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [session, status, router]); // Added status and router to dependencies for useCallback


  useEffect(() => {
    if (status === "unauthenticated") {
      router.push('/api/auth/signin');
    } else if (status === "authenticated") {
      fetchEmails(false); // Fetch initially without 'fetch_new'
    }
  }, [status, router, fetchEmails]); // Ensure useEffect dependencies are complete

  return (
    <div className="p-6 font-sans">
      <h1 className="text-3xl font-bold mb-6">📨 Email Dashboard</h1>

      {/* The Send Email Form section has been removed */}

      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Inbox</h2>
          <button
            onClick={() => fetchEmails(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            disabled={loading} // Disable if loading
          >
            {loading ? "Refreshing..." : "Refresh Emails"}
          </button>
        </div>

        {error && <p className="text-red-600 mb-4 font-medium">Error: {error}</p>}
        
        {!loading && emails.length === 0 && (
          <p className="text-gray-500">No emails found in your inbox, or you haven't granted permissions.</p>
        )}

        <ul className="space-y-3">
          {emails.map((email) => (
            // Using Link component for client-side navigation
            <Link key={email.id} href={`/emails/${email.id}`} passHref>
              <li className="block p-4 border rounded-lg bg-white hover:bg-gray-50 cursor-pointer transition-colors duration-200">
                <p className="font-semibold text-gray-800">{email.from}</p>
                <p className="font-medium text-gray-900">{email.subject}</p>
                <p className="text-sm text-gray-600 mt-1 truncate">
                  {email.snippet}
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  Status: <span className="font-medium">{email.reply_status}</span>
                </p>
              </li>
            </Link>
          ))}
        </ul>
      </section>
    </div>
  );
}