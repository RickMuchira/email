// /home/rick110/RickDrive/email_automation/frontend/app/emails/[id]/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  reply_status: string;
  full_body: string; // Ensure this is always present after fetching
}

export default function EmailDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true); // Tracks initial email fetch loading
  const [error, setError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");

  // New states for AI generation
  const [aiPrompt, setAiPrompt] = useState(""); // User's input for AI generation context
  const [aiGenerating, setAiGenerating] = useState(false); // Tracks AI generation loading
  const [aiGenerationError, setAiGenerationError] = useState<string | null>(null); // Tracks AI specific errors

  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // Fetches the details for a single email
  const fetchEmailDetails = useCallback(async () => {
    if (sessionStatus === "loading" || !session?.accessToken || !id) return;

    setLoading(true); // Start loading for email details
    setError(null);
    setSendStatus(null); // Clear previous send status
    setAiGenerationError(null); // Clear previous AI generation errors

    try {
      const res = await fetch(`http://localhost:8000/api/read-emails?email_id=${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.accessToken,
          user_email: session.user?.email,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 401) {
          router.push('/api/auth/signin');
          return;
        }
        throw new Error(errData.detail || `HTTP error! Status: ${res.status}`);
      }

      const data = await res.json();
      if (data.email) {
        setEmail(data.email);
        setReplySubject(`Re: ${data.email.subject || "No Subject"}`);
        setReplyBody(""); // Clear reply body for new email view
        setAiPrompt(""); // Clear AI prompt on new email load
      } else {
        throw new Error("Email data not found in the server response.");
      }

    } catch (err: any) {
      setError(`Failed to load email details: ${err.message}`);
    } finally {
      setLoading(false); // Ensure main loading state is ended after fetching email details
    }
  }, [id, session, sessionStatus, router]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.push('/api/auth/signin');
    } else if (sessionStatus === "authenticated") {
      fetchEmailDetails();
    }
  }, [sessionStatus, router, fetchEmailDetails]);


  // Handles sending the reply
  const handleSendReply = async () => {
    if (!email || !session?.accessToken || !replyBody.trim() || !replySubject.trim()) {
        setSendStatus("Error: Missing information to send reply.");
        return;
    }

    setSendStatus("Sending...");
    try {
        const res = await fetch("http://localhost:8000/api/send-manual-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                access_token: session.accessToken,
                to: email.from,
                subject: replySubject,
                body: replyBody,
                original_message_id: email.id,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            if (res.status === 401) {
              setSendStatus("❌ Error: Session expired. Please sign in again.");
              router.push('/api/auth/signin');
              return;
            }
            throw new Error(data.detail || `Failed to send email with status: ${res.status}`);
        }

        setSendStatus("✅ Reply sent successfully!");
        setReplyBody("");
        setReplySubject("");
        setTimeout(() => {
          router.push("/emails");
        }, 1500);

    } catch (err: any) {
        setSendStatus(`❌ Error sending reply: ${err.message}`);
    }
};

// NEW FUNCTION: Call Backend to Generate Reply with Groq
const handleGenerateWithAI = async () => {
    if (!email || !session?.accessToken || !session.user?.email || !aiPrompt.trim()) {
        setAiGenerationError("Please provide a prompt for AI generation.");
        return;
    }

    setAiGenerating(true); // Start Groq generation loading
    setAiGenerationError(null); // Clear previous AI generation errors
    setReplyBody("Generating AI reply..."); // Give immediate feedback in the textarea

    try {
        // Correct endpoint: /api/generate-email-body
        const res = await fetch("http://localhost:8000/api/generate-email-body", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                access_token: session.accessToken, // For backend auth
                user_email: session.user.email,
                context: aiPrompt, // User's prompt for AI context
                sender: email.from, // Original sender's email
                subject: email.subject, // Original email subject
            }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            if (res.status === 401) {
              setAiGenerationError("❌ Session expired. Please sign in again.");
              router.push('/api/auth/signin');
              return;
            }
            throw new Error(data.detail || 'Failed to generate email body.');
        }

        // Set the generated body to the replyBody state
        setReplyBody(data.generated_body);
        setAiPrompt(""); // Clear the AI prompt after generation
        setAiGenerationError(null); // Clear any previous AI errors
    } catch (err: any) {
        setAiGenerationError(`❌ AI Generation Error: ${err.message}`);
        // Optionally, clear the "Generating AI reply..." message if an error occurred
        if (replyBody === "Generating AI reply...") {
            setReplyBody("");
        }
    } finally {
        setAiGenerating(false); // End Groq generation loading
    }
};


  // Adjust overall loading state to consider both email fetching and AI generation
  if (loading) return <p className="p-6 text-gray-500">Loading email details...</p>;
  if (error) return <p className="p-6 text-red-600 font-medium">Error: {error}</p>;
  if (!email) return <p className="p-6 text-gray-500">No email data found.</p>;

  return (
    <div className="p-6 font-sans max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Email Details</h1>
            <Link href="/emails">
                <span className="text-blue-500 hover:underline cursor-pointer">&larr; Back to Inbox</span>
            </Link>
        </div>

      {/* Email Information Section */}
      <section className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Original Message</h2>
        <div className="space-y-2">
            <p><strong className="font-medium text-gray-700">From:</strong> {email.from}</p>
            <p><strong className="font-medium text-gray-700">Subject:</strong> {email.subject}</p>
            <div className="mt-2 text-gray-800 bg-gray-50 p-3 rounded-md min-h-[100px] overflow-auto">
                <p dangerouslySetInnerHTML={{ __html: email.full_body }}></p>
            </div>
            {email.snippet && email.full_body !== email.snippet && (
              <p className="mt-2 text-gray-600 text-sm italic">Snippet: {email.snippet}</p>
            )}
        </div>
      </section>

      {/* AI Generate Reply Section */}
      <section className="mb-8 p-4 border rounded-lg bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-3">✨ Generate Reply with AI</h2>
        <div className="space-y-4">
            <div>
                <label htmlFor="aiPrompt" className="block text-sm font-medium text-gray-700">
                    What should the AI's reply be about? (e.g., "accept the invitation", "decline politely and suggest another date", "ask for more details about the project")
                </label>
                <textarea
                    id="aiPrompt"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full p-3 border rounded-md focus:ring-purple-500 focus:border-purple-500 min-h-[80px]"
                    placeholder="E.g., Accept the meeting invitation."
                    disabled={aiGenerating}
                />
            </div>
            <button
                onClick={handleGenerateWithAI}
                className="bg-purple-600 text-white px-5 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!aiPrompt.trim() || aiGenerating || !email}
            >
                {aiGenerating ? "Generating..." : "Generate AI Reply"}
            </button>
            {aiGenerationError && (
              <p className="text-red-600 text-sm font-medium mt-2">{aiGenerationError}</p>
            )}
        </div>
      </section>


      {/* Manual Reply Section */}
      <section className="p-4 border rounded-lg bg-white shadow-sm">
            <h2 className="text-xl font-semibold mb-3">✉️ Compose Reply</h2>
            <p className="text-sm text-gray-500 mb-4">
               Review the generated reply or type your own.
            </p>

            <div className="space-y-4">
                <div>
                  <label htmlFor="replyTo" className="block text-sm font-medium text-gray-700">To:</label>
                  <input
                    id="replyTo"
                    type="text"
                    value={email.from}
                    readOnly
                    className="w-full p-2 border rounded-md bg-gray-100 text-gray-600"
                  />
                </div>
                <div>
                  <label htmlFor="replySubject" className="block text-sm font-medium text-gray-700">Subject:</label>
                  <input
                    id="replySubject"
                    type="text"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="replyBody" className="block text-sm font-medium text-gray-700">Body:</label>
                  <textarea
                      id="replyBody"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      className="w-full p-3 border rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[200px]"
                      placeholder={aiGenerating ? "Generating AI reply..." : "Type your reply here or use AI to generate one above..."}
                      disabled={aiGenerating} // Disable while generating
                  />
                </div>
                <button
                    onClick={handleSendReply}
                    className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={!replyBody.trim() || !replySubject.trim() || sendStatus === "Sending..." || aiGenerating}
                >
                    {sendStatus === "Sending..." ? "Sending..." : "Send Reply"}
                </button>
                {sendStatus && (
                  <p className={`text-sm font-medium mt-2 ${sendStatus.startsWith('❌ Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {sendStatus}
                  </p>
                )}
            </div>
      </section>
    </div>
  );
}
