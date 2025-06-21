// app/emails/compose/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";

function ComposeEmailContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({
    to: "",
    subject: "",
    body: ""
  });
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({
    type: null,
    message: ""
  });

  const sendEmail = async () => {
    if (!session?.accessToken) {
      setStatus({ type: 'error', message: "Not authenticated. Please sign in again." });
      return;
    }

    if (!form.to || !form.subject || !form.body) {
      setStatus({ type: 'error', message: "Please fill in all fields." });
      return;
    }

    setSending(true);
    setStatus({ type: null, message: "" });

    try {
      const response = await fetch("http://localhost:8000/api/send-manual-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.accessToken,
          to: form.to,
          subject: form.subject,
          body: form.body,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setStatus({ type: 'success', message: "Email sent successfully!" });
        setForm({ to: "", subject: "", body: "" });
        
        // Redirect to emails page after 2 seconds
        setTimeout(() => {
          router.push("/emails");
        }, 2000);
      } else {
        if (response.status === 401) {
          setStatus({ type: 'error', message: "Session expired. Please sign in again." });
          router.push('/');
          return;
        }
        throw new Error(data.detail || data.error || 'Unknown error occurred');
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: `Failed to send email: ${error.message}` });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/emails" className="text-blue-600 hover:text-blue-700 mr-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Compose Email</h1>
            </div>
            <span className="text-sm text-gray-600">
              {session?.user?.email}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow-sm rounded-lg border">
          <div className="p-6">
            {/* Status Messages */}
            {status.type && (
              <div className={`mb-6 p-4 rounded-md ${
                status.type === 'success' 
                  ? 'bg-green-50 border border-green-200 text-green-700' 
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                <div className="flex">
                  <svg 
                    className={`w-5 h-5 mr-2 ${status.type === 'success' ? 'text-green-400' : 'text-red-400'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    {status.type === 'success' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    )}
                  </svg>
                  <p className="text-sm font-medium">{status.message}</p>
                </div>
              </div>
            )}

            {/* Email Form */}
            <div className="space-y-6">
              {/* To Field */}
              <div>
                <label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-2">
                  To
                </label>
                <input
                  type="email"
                  id="to"
                  value={form.to}
                  onChange={(e) => setForm({ ...form, to: e.target.value })}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  disabled={sending}
                />
              </div>

              {/* Subject Field */}
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Email subject"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  disabled={sending}
                />
              </div>

              {/* Body Field */}
              <div>
                <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  id="body"
                  rows={12}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Write your email message here..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-vertical"
                  disabled={sending}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4">
                <Link 
                  href="/emails"
                  className="text-gray-600 hover:text-gray-700 text-sm font-medium"
                >
                  ← Back to Inbox
                </Link>
                
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setForm({ to: "", subject: "", body: "" })}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={sending}
                  >
                    Clear
                  </button>
                  <button
                    onClick={sendEmail}
                    disabled={sending || !form.to || !form.subject || !form.body}
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                  >
                    {sending && (
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {sending ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-blue-400 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-800">Tips</h3>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                <li>• Make sure the recipient email address is valid</li>
                <li>• Write a clear and descriptive subject line</li>
                <li>• Keep your message professional and concise</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ComposeEmailPage() {
  return (
    <AuthGuard>
      <ComposeEmailContent />
    </AuthGuard>
  );
}