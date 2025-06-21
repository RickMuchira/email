// app/emails/page.tsx
"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";

// Updated Email Interface matching backend response
interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  sentiment: string;
  reply_status: string;
  suggested_reply_body?: string;
  full_body?: string;
}

interface EmailsResponse {
  emails: Email[];
}

function EmailPageContent() {
  const { data: session, status } = useSession();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  // Enhanced sign out function with proper cleanup
  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    
    try {
      console.log("🚪 Initiating sign out...");
      
      // Clear local state first
      setEmails([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      
      // Clear any cached data
      if (typeof window !== 'undefined') {
        // Clear any local storage items related to auth
        Object.keys(localStorage).forEach(key => {
          if (key.includes('next-auth') || key.includes('email') || key.includes('session')) {
            localStorage.removeItem(key);
          }
        });
        
        // Clear session storage
        Object.keys(sessionStorage).forEach(key => {
          if (key.includes('next-auth') || key.includes('email') || key.includes('session')) {
            sessionStorage.removeItem(key);
          }
        });
      }
      
      console.log("🧹 Local data cleared");
      
      // Sign out with NextAuth
      await signOut({ 
        callbackUrl: '/',
        redirect: true 
      });
      
    } catch (error) {
      console.error("❌ Error during sign out:", error);
      // Force redirect to home even if sign out fails
      router.push('/');
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  // Function to fetch emails from backend
  const fetchEmails = useCallback(async (fetchNew: boolean = false) => {
    if (status === "loading") return;
    
    if (status === "unauthenticated" || !session?.accessToken) {
      console.log("❌ No valid session, redirecting to home");
      router.push('/');
      return;
    }

    // Check for session errors
    if (session.error) {
      console.error("❌ Session has error:", session.error);
      setError("Your session has expired. Please sign in again.");
      await handleSignOut();
      return;
    }

    // Set appropriate loading state
    if (fetchNew) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    setError(null);
    
    try {
      console.log('📧 Fetching emails with fetchNew:', fetchNew);
      
      const response = await fetch(
        `http://localhost:8000/api/read-emails?fetch_new=${fetchNew}&limit=20`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            user_email: session.user?.email,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          console.error('🔐 Authentication failed, session expired');
          setError("Your session has expired. Signing you out...");
          await handleSignOut();
          return;
        }
        
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
      }

      const data: EmailsResponse = await response.json();
      console.log('✅ Received emails data:', data?.emails?.length || 0, 'emails');
      
      // Ensure we have a valid emails array
      const emailsArray = Array.isArray(data.emails) ? data.emails : [];
      setEmails(emailsArray);
      
    } catch (err: any) {
      console.error('❌ Error fetching emails:', err);
      
      // Check if it's a network error
      if (err.message.includes('fetch') || err.name === 'TypeError') {
        setError('Cannot connect to backend server. Please ensure the backend is running on http://localhost:8000');
      } else {
        setError(`Failed to fetch emails: ${err.message}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, status, router, handleSignOut]);

  // Handle initial load and authentication changes
  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated") {
      console.log("🔐 User not authenticated, redirecting");
      router.push('/');
      return;
    }
    
    if (status === "authenticated" && session?.accessToken) {
      // Check for session errors first
      if (session.error) {
        console.error("❌ Session error detected:", session.error);
        handleSignOut();
        return;
      }
      
      // Fetch emails on initial load
      fetchEmails(false);
    }
  }, [status, session?.accessToken, session?.error, router, fetchEmails, handleSignOut]);

  // Function to get sentiment badge styling
  const getSentimentClass = (sentiment: string) => {
    switch (sentiment?.toUpperCase()) {
      case 'POSITIVE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'NEGATIVE':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'NEUTRAL':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'N/A':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  // Function to get reply status styling
  const getReplyStatusClass = (status: string) => {
    switch (status) {
      case 'Not Replied':
        return 'text-red-600 bg-red-50';
      case 'Pending User Review':
        return 'text-yellow-600 bg-yellow-50';
      case 'User Replied':
        return 'text-green-600 bg-green-50';
      case 'Processing Failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  // Show loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your session...</p>
        </div>
      </div>
    );
  }

  // Show authentication error
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">📧 Email Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {session?.user?.email}
              </span>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
              >
                {signingOut ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing Out...
                  </>
                ) : (
                  "Sign Out"
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Bar */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Your Inbox</h2>
            <p className="text-sm text-gray-600 mt-1">
              {emails.length > 0 ? `Showing ${emails.length} emails` : 'No emails found'}
            </p>
          </div>
          <div className="flex space-x-3">
            <Link
              href="/emails/compose"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors inline-flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Compose
            </Link>
            <button
              onClick={() => fetchEmails(true)}
              disabled={refreshing || loading || signingOut}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center"
            >
              <svg 
                className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Refreshing...' : 'Refresh from Gmail'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your emails...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && emails.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No emails found</h3>
            <p className="text-gray-600 mb-4">
              Your inbox appears to be empty, or you may need to grant Gmail permissions.
            </p>
            <button
              onClick={() => fetchEmails(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Check Gmail Again
            </button>
          </div>
        )}

        {/* Emails List */}
        {!loading && emails.length > 0 && (
          <div className="bg-white shadow-sm rounded-lg border">
            <ul className="divide-y divide-gray-200">
              {emails.map((email, index) => (
                <li key={email.id} className="hover:bg-gray-50 transition-colors">
                  <Link href={`/emails/${email.id}`} className="block p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        {/* Sender */}
                        <div className="flex items-center mb-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {email.from || 'Unknown Sender'}
                          </p>
                          <div className="flex items-center ml-2 space-x-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSentimentClass(email.sentiment)}`}>
                              {email.sentiment || 'N/A'}
                            </span>
                          </div>
                        </div>
                        
                        {/* Subject */}
                        <p className="text-sm font-medium text-gray-900 mb-1 truncate">
                          {email.subject || '(No Subject)'}
                        </p>
                        
                        {/* Snippet */}
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                          {email.snippet || 'No preview available'}
                        </p>
                        
                        {/* Status */}
                        <div className="flex items-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getReplyStatusClass(email.reply_status)}`}>
                            {email.reply_status || 'Unknown Status'}
                          </span>
                          {email.suggested_reply_body && email.reply_status === "Pending User Review" && (
                            <span className="ml-2 text-xs text-blue-600 font-medium">
                              • AI Reply Ready
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Arrow */}
                      <div className="ml-4 flex-shrink-0">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Footer */}
        {emails.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Showing {emails.length} emails from your Gmail inbox</p>
            <p className="mt-1">
              Last updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function EmailPage() {
  return (
    <AuthGuard>
      <EmailPageContent />
    </AuthGuard>
  );
}