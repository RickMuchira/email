// /home/rick110/RickDrive/email_automation/frontend/app/emails/page.tsx

"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

interface Email {
  id: string;
  user_email: string;
  threadId?: string;
  from_address: string;
  subject: string;
  snippet: string;
  internalDate: string;
  sentiment?: string;
  reply_status?: string;
  suggested_reply_body?: string;
  full_body?: string;
  is_read: number;
  is_replied: number;
  labels?: string;
}

interface SyncStatus {
  user_email: string;
  total_emails_in_gmail: number;
  emails_in_local_db: number;
  last_sync_timestamp?: number;
  sync_status: string;
  latest_50_synced: boolean;
}

interface EmailResponse {
  emails: Email[];
  total_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  sync_status: string;
  total_emails_in_gmail: number;
}

export default function EmailPage() {
  const { data: session, status, update } = useSession();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [emailResponse, setEmailResponse] = useState<EmailResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasInitialSync, setHasInitialSync] = useState(false);
  const router = useRouter();

  const EMAILS_PER_PAGE = 50;

  // Check for authentication errors and handle them
  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      setAuthError("Your session has expired. Please sign in again to continue.");
      console.error("🔴 Authentication error detected:", session.error);
    } else {
      setAuthError(null);
    }
  }, [session?.error]);

  // Force token refresh
  const forceTokenRefresh = useCallback(async () => {
    try {
      console.log("🔄 Forcing token refresh...");
      await update(); // This triggers the JWT callback with trigger: "update"
      console.log("✅ Token refresh completed");
    } catch (error) {
      console.error("❌ Failed to refresh token:", error);
      setAuthError("Failed to refresh authentication. Please sign in again.");
    }
  }, [update]);

  // Handle re-authentication
  const handleReAuth = useCallback(async () => {
    try {
      setAuthError(null);
      console.log("🔄 Starting re-authentication...");
      
      // Sign out first to clear invalid tokens
      await signOut({ redirect: false });
      
      // Wait a moment then sign back in
      setTimeout(() => {
        signIn("google", { 
          redirect: false,
          prompt: "consent" // Force consent to ensure fresh tokens
        });
      }, 1000);
    } catch (error) {
      console.error("❌ Re-authentication failed:", error);
      setAuthError("Re-authentication failed. Please try again.");
    }
  }, []);

  // Enhanced API call with auth error handling
  const makeAuthenticatedRequest = useCallback(async (url: string, options: RequestInit = {}) => {
    if (!session?.accessToken || session.error) {
      throw new Error("No valid access token available");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
      },
    });

    // Handle authentication errors
    if (response.status === 401) {
      console.error("🔴 Received 401 - token may be invalid");
      setAuthError("Authentication failed. Please sign in again.");
      throw new Error("Authentication failed");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    return response;
  }, [session?.accessToken, session?.error]);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    if (!session?.user?.email || session?.error) return null;

    try {
      const response = await makeAuthenticatedRequest(
        `http://localhost:8000/api/sync-status/${session.user.email}`
      );
      const status = await response.json();
      setSyncStatus(status);
      return status;
    } catch (error) {
      console.error("Error fetching sync status:", error);
      if (error instanceof Error && error.message.includes("Authentication")) {
        // Don't set general error for auth issues - they're handled separately
        return null;
      }
      setError(`Failed to fetch sync status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }, [session?.user?.email, session?.error, makeAuthenticatedRequest]);

  // Fetch emails from database
  const fetchEmails = useCallback(async (currentOffset = 0, fetchNew = false, append = false) => {
    if (!session?.accessToken || !session?.user?.email || session?.error) {
      setError("Authentication required. Please sign in.");
      setLoading(false);
      return;
    }

    if (!append) setLoading(currentOffset === 0);
    else setLoadingMore(true);
    
    setError(null);

    try {
      const response = await makeAuthenticatedRequest(
        `http://localhost:8000/api/read-emails?fetch_new=${fetchNew}&limit=${EMAILS_PER_PAGE}&offset=${currentOffset}`,
        {
          method: "POST",
          body: JSON.stringify({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            user_email: session.user.email,
          }),
        }
      );

      const data: EmailResponse = await response.json();
      setEmailResponse(data);
      
      if (append) {
        setEmails(prev => [...prev, ...data.emails]);
      } else {
        setEmails(data.emails);
      }
      
      setOffset(currentOffset + data.emails.length);
    } catch (error) {
      console.error("Error fetching emails:", error);
      if (!(error instanceof Error && error.message.includes("Authentication"))) {
        setError(error instanceof Error ? error.message : "Failed to fetch emails");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [session?.accessToken, session?.refreshToken, session?.user?.email, session?.error, makeAuthenticatedRequest]);

  // Sync latest emails from Gmail
  const syncLatestEmails = useCallback(async (count = 50) => {
    if (!session?.accessToken || !session?.user?.email || session?.error) {
      setAuthError("Authentication required for sync. Please sign in again.");
      return;
    }

    setSyncLoading(true);
    setError(null);
    setAuthError(null);

    try {
      const response = await makeAuthenticatedRequest(
        `http://localhost:8000/api/sync-latest-emails?count=${count}`,
        {
          method: "POST",
          body: JSON.stringify({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            user_email: session.user.email,
          }),
        }
      );

      const data = await response.json();
      console.log("✅ Sync result:", data);

      // Refresh sync status and emails
      await fetchSyncStatus();
      setOffset(0);
      await fetchEmails(0, false);
      setHasInitialSync(true);
    } catch (error) {
      console.error("Error syncing emails:", error);
      if (!(error instanceof Error && error.message.includes("Authentication"))) {
        setError(error instanceof Error ? error.message : "Failed to sync emails");
      }
    } finally {
      setSyncLoading(false);
    }
  }, [session?.accessToken, session?.refreshToken, session?.user?.email, session?.error, makeAuthenticatedRequest, fetchSyncStatus, fetchEmails]);

  // Load older emails from Gmail
  const loadOlderEmails = useCallback(async () => {
    if (!session?.accessToken || !session?.user?.email || loadingOlder || session?.error) return;

    setLoadingOlder(true);
    setError(null);

    try {
      const response = await makeAuthenticatedRequest(
        `http://localhost:8000/api/load-older-emails?count=${EMAILS_PER_PAGE}`,
        {
          method: "POST",
          body: JSON.stringify({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
            user_email: session.user.email,
          }),
        }
      );

      const data = await response.json();
      console.log("📄 Loaded older emails:", data);

      if (data.emails_loaded > 0) {
        await fetchEmails(0, false);
        await fetchSyncStatus();
      }
    } catch (error) {
      console.error("Error loading older emails:", error);
      if (!(error instanceof Error && error.message.includes("Authentication"))) {
        setError(error instanceof Error ? error.message : "Failed to load older emails");
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [session?.accessToken, session?.refreshToken, session?.user?.email, session?.error, loadingOlder, makeAuthenticatedRequest, fetchEmails, fetchSyncStatus]);

  // Load more emails (pagination within local DB)
  const loadMoreEmails = useCallback(async () => {
    if (!emailResponse?.has_more || loadingMore || session?.error) return;
    await fetchEmails(offset, false, true);
  }, [emailResponse?.has_more, offset, loadingMore, session?.error, fetchEmails]);

  // Refresh new emails only
  const refreshNewEmails = useCallback(async () => {
    if (session?.error) {
      setAuthError("Cannot refresh emails - authentication required.");
      return;
    }
    await fetchEmails(0, true);
    await fetchSyncStatus();
  }, [session?.error, fetchEmails, fetchSyncStatus]);

  // Initial load
  useEffect(() => {
    if (status === "loading") return;
    
    if (!session) {
      router.push("/auth/signin");
      return;
    }

    if (session.error) {
      // Don't try to load data if there's an auth error
      setLoading(false);
      return;
    }

    const initializeData = async () => {
      const syncStatus = await fetchSyncStatus();
      
      if (syncStatus?.sync_status === "never_synced") {
        setLoading(false);
        setHasInitialSync(false);
      } else {
        await fetchEmails(0, false);
        setHasInitialSync(true);
      }
    };

    initializeData();
  }, [session, status, router, fetchSyncStatus, fetchEmails]);

  // Format date
  const formatDate = (internalDate: string) => {
    const date = new Date(parseInt(internalDate));
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - (timestamp * 1000);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Handle email click
  const handleEmailClick = (emailId: string) => {
    if (session?.error) {
      setAuthError("Authentication required to view email details.");
      return;
    }
    router.push(`/emails/${emailId}`);
  };

  // Get sync status color
  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return 'text-green-600 bg-green-50';
      case 'syncing': return 'text-yellow-600 bg-yellow-50';
      case 'error': return 'text-red-600 bg-red-50';
      case 'never_synced': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Email Automation</h1>
              <p className="text-gray-600">Welcome, {session.user?.email}</p>
              {session.error && (
                <p className="text-sm text-red-600 mt-1">⚠️ Authentication issue detected</p>
              )}
            </div>
            <button
              onClick={() => signOut()}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Authentication Error Banner */}
      {authError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-100 border border-red-400 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div className="flex">
                <div className="text-red-600 mr-3">🔐</div>
                <div>
                  <h3 className="text-red-800 font-medium">Authentication Required</h3>
                  <p className="text-red-700 mt-1">{authError}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={forceTokenRefresh}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  Refresh Token
                </button>
                <button
                  onClick={handleReAuth}
                  className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                >
                  Sign In Again
                </button>
                <button
                  onClick={() => setAuthError(null)}
                  className="text-red-600 hover:text-red-800"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Info in Development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <details className="bg-gray-100 rounded p-2 text-xs">
            <summary className="cursor-pointer">Debug Info</summary>
            <pre className="mt-2 overflow-auto">
              {JSON.stringify({
                hasAccessToken: !!session?.accessToken,
                hasRefreshToken: !!session?.refreshToken,
                sessionError: session?.error,
                authError: authError,
              }, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Rest of your component remains the same... */}
      {/* Sync Status Panel */}
      {syncStatus && !session?.error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Gmail Sync Status</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSyncStatusColor(syncStatus.sync_status)}`}>
                {syncStatus.sync_status.replace('_', ' ')}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900">Total in Gmail</h3>
                <p className="text-2xl font-bold text-blue-600">{syncStatus.total_emails_in_gmail}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-medium text-green-900">Synced Locally</h3>
                <p className="text-2xl font-bold text-green-600">{syncStatus.emails_in_local_db}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-medium text-purple-900">Latest 50 Synced</h3>
                <p className={`text-lg font-semibold ${syncStatus.latest_50_synced ? 'text-green-600' : 'text-orange-600'}`}>
                  {syncStatus.latest_50_synced ? '✅ Yes' : '⏳ No'}
                </p>
              </div>
            </div>
            
            {syncStatus.last_sync_timestamp && (
              <p className="text-sm text-gray-600">
                Last sync: {formatRelativeTime(syncStatus.last_sync_timestamp)} ({new Date(syncStatus.last_sync_timestamp * 1000).toLocaleString()})
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="flex flex-wrap gap-4">
          {!hasInitialSync && !session?.error ? (
            <div className="w-full bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Get Started</h3>
              <p className="text-blue-700 mb-4">
                Welcome! Start by syncing your latest 50 emails to get started with the email automation system.
              </p>
              <button
                onClick={() => syncLatestEmails(50)}
                disabled={syncLoading || !!session?.error}
                className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition disabled:opacity-50 font-medium"
              >
                {syncLoading ? "Syncing..." : "🚀 Sync Latest 50 Emails"}
              </button>
            </div>
          ) : !session?.error ? (
            <>
              <button
                onClick={() => syncLatestEmails(50)}
                disabled={syncLoading}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
              >
                {syncLoading ? "Syncing..." : "🔄 Sync Latest 50"}
              </button>
              
              <button
                onClick={refreshNewEmails}
                disabled={loading}
                className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition disabled:opacity-50"
              >
                {loading ? "Refreshing..." : "✨ Check New Emails"}
              </button>

              <button
                onClick={loadOlderEmails}
                disabled={loadingOlder}
                className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 transition disabled:opacity-50"
              >
                {loadingOlder ? "Loading..." : "📄 Load Older Emails"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <strong className="font-bold">Error: </strong>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="float-right text-red-700 hover:text-red-900"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Email List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">
                Your Emails {emailResponse?.total_count !== undefined && `(${emailResponse.total_count} total)`}
              </h2>
              {emails.length > 0 && (
                <p className="text-sm text-gray-500">
                  Showing {emails.length} emails
                </p>
              )}
            </div>
          </div>

          {loading && emails.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading emails...</p>
              </div>
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📧</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No emails found</h3>
              <p className="text-gray-500 mb-4">
                {session?.error 
                  ? "Please resolve authentication issues to view your emails."
                  : hasInitialSync 
                  ? "You don't have any emails in your account." 
                  : "Start by syncing your emails from Gmail to see them here."
                }
              </p>
              {!hasInitialSync && !session?.error && (
                <button
                  onClick={() => syncLatestEmails(50)}
                  disabled={syncLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {syncLoading ? "Syncing..." : "Sync Your Emails"}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-200">
                {emails.map((email) => (
                  <div
                    key={`${email.id}-${email.user_email}`}
                    onClick={() => handleEmailClick(email.id)}
                    className={`px-6 py-4 hover:bg-gray-50 cursor-pointer transition ${
                      email.is_read ? "bg-white" : "bg-blue-50"
                    } ${session?.error ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {email.from_address}
                          </p>
                          {!email.is_read && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Unread
                            </span>
                          )}
                          {email.sentiment && email.sentiment !== "N/A" && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              email.sentiment === "POSITIVE" ? "bg-green-100 text-green-800" :
                              email.sentiment === "NEGATIVE" ? "bg-red-100 text-red-800" :
                              "bg-gray-100 text-gray-800"
                            }`}>
                              {email.sentiment}
                            </span>
                          )}
                          {email.is_replied === 1 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              Replied
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 font-medium mb-1 truncate">
                          {email.subject || "No Subject"}
                        </p>
                        <p className="text-sm text-gray-600 truncate">
                          {email.snippet}
                        </p>
                      </div>
                      <div className="text-sm text-gray-500 flex-shrink-0 ml-4">
                        {formatDate(email.internalDate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-700">
                    {emailResponse && (
                      <>
                        Showing {emails.length} of {emailResponse.total_count} emails
                        {emails.length < emailResponse.total_count && (
                          <span className="text-gray-500 ml-1">
                            (Page {Math.floor(offset / EMAILS_PER_PAGE)})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  
                  <div className="flex space-x-2">
                    {emailResponse?.has_more && !session?.error && (
                      <button
                        onClick={loadMoreEmails}
                        disabled={loadingMore}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                      >
                        {loadingMore ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Loading...
                          </div>
                        ) : (
                          "Load More"
                        )}
                      </button>
                    )}
                    
                    {syncStatus && !syncStatus.latest_50_synced && !session?.error && (
                      <button
                        onClick={() => syncLatestEmails(50)}
                        disabled={syncLoading}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition disabled:opacity-50 text-sm"
                      >
                        {syncLoading ? "Syncing..." : "Sync Latest"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Statistics Footer */}
        {syncStatus && emails.length > 0 && !session?.error && (
          <div className="mt-6 bg-white rounded-lg shadow p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-blue-600">{emails.filter(e => !e.is_read).length}</p>
                <p className="text-sm text-gray-600">Unread</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{emails.filter(e => e.is_replied).length}</p>
                <p className="text-sm text-gray-600">Replied</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{syncStatus.emails_in_local_db}</p>
                <p className="text-sm text-gray-600">Total Synced</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-600">
                  {syncStatus.total_emails_in_gmail > 0 
                    ? Math.round((syncStatus.emails_in_local_db / syncStatus.total_emails_in_gmail) * 100)
                    : 0}%
                </p>
                <p className="text-sm text-gray-600">Coverage</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}