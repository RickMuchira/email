// /home/rick110/RickDrive/email_automation/frontend/app/emails/[id]/page.tsx

"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import DOMPurify from 'dompurify';
import Link from "next/link";

// Enhanced Email interface with proper Gmail fields
interface Email {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  sentiment: string;
  reply_status: string;
  suggested_reply_body?: string;
  full_body?: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{
      name: string;
      value: string;
    }>;
  };
}

// Email header structure for Gmail protocol compliance
interface EmailHeaders {
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  to?: string;
  from?: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

export default function EmailDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  // Email and UI state
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reply composition state
  const [replyTo, setReplyTo] = useState<string>("");
  const [replySubject, setReplySubject] = useState<string>("");
  const [replyBody, setReplyBody] = useState<string>("");
  const [ccAddresses, setCcAddresses] = useState<string>("");
  const [bccAddresses, setBccAddresses] = useState<string>("");

  // AI generation state
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerationError, setAiGenerationError] = useState<string | null>(null);

  // Reply actions state
  const [sendStatus, setSendStatus] = useState<string>("");
  const [replyType, setReplyType] = useState<'reply' | 'reply-all' | 'forward'>('reply');

  // Email headers parsed from Gmail
  const [emailHeaders, setEmailHeaders] = useState<EmailHeaders>({});

  // Refs to prevent infinite re-renders
  const fetchedRef = useRef(false);
  const emailIdRef = useRef<string | null>(null);

  // Parse email headers for Gmail protocol compliance
  const parseEmailHeaders = useCallback((email: Email): EmailHeaders => {
    const headers: EmailHeaders = {};
    
    if (email.payload?.headers) {
      email.payload.headers.forEach(header => {
        const name = header.name.toLowerCase();
        const value = header.value;
        
        switch (name) {
          case 'message-id':
            headers.messageId = value;
            break;
          case 'in-reply-to':
            headers.inReplyTo = value;
            break;
          case 'references':
            headers.references = value;
            break;
          case 'from':
            headers.from = value;
            break;
          case 'to':
            headers.to = value;
            break;
          case 'cc':
            headers.cc = value;
            break;
          case 'reply-to':
            headers.replyTo = value;
            break;
        }
      });
    }
    
    return headers;
  }, []);

  // Extract email address from formatted string (e.g., "Name <email@domain.com>")
  const extractEmailAddress = useCallback((emailString: string): string => {
    const match = emailString.match(/<([^>]+)>/);
    return match ? match[1] : emailString.trim();
  }, []);

  // Set up reply recipients based on reply type
  const setupReplyRecipients = useCallback((type: 'reply' | 'reply-all' | 'forward') => {
    if (!email) return;

    const headers = parseEmailHeaders(email);
    const fromAddress = extractEmailAddress(headers.from || email.from);
    const replyToAddress = headers.replyTo ? extractEmailAddress(headers.replyTo) : fromAddress;

    setReplyType(type);

    switch (type) {
      case 'reply':
        setReplyTo(replyToAddress);
        setCcAddresses("");
        setBccAddresses("");
        setReplySubject(email.subject.startsWith('Re: ') ? email.subject : `Re: ${email.subject}`);
        break;

      case 'reply-all':
        setReplyTo(replyToAddress);
        
        // Add original To and CC recipients (excluding our own email)
        const userEmail = session?.user?.email?.toLowerCase();
        const allRecipients = new Set<string>();
        
        if (headers.to) {
          headers.to.split(',').forEach(addr => {
            const cleanAddr = extractEmailAddress(addr.trim()).toLowerCase();
            if (cleanAddr !== userEmail && cleanAddr !== replyToAddress.toLowerCase()) {
              allRecipients.add(addr.trim());
            }
          });
        }
        
        if (headers.cc) {
          headers.cc.split(',').forEach(addr => {
            const cleanAddr = extractEmailAddress(addr.trim()).toLowerCase();
            if (cleanAddr !== userEmail && cleanAddr !== replyToAddress.toLowerCase()) {
              allRecipients.add(addr.trim());
            }
          });
        }
        
        setCcAddresses(Array.from(allRecipients).join(', '));
        setBccAddresses("");
        setReplySubject(email.subject.startsWith('Re: ') ? email.subject : `Re: ${email.subject}`);
        break;

      case 'forward':
        setReplyTo("");
        setCcAddresses("");
        setBccAddresses("");
        setReplySubject(email.subject.startsWith('Fwd: ') ? email.subject : `Fwd: ${email.subject}`);
        
        // Pre-populate forward body with original message
        const forwardBody = `\n\n---------- Forwarded message ---------\nFrom: ${email.from}\nDate: ${new Date(parseInt(email.internalDate || '0')).toLocaleString()}\nSubject: ${email.subject}\nTo: ${headers.to || ''}\n\n${email.full_body || email.snippet}`;
        setReplyBody(forwardBody);
        break;
    }
  }, [email, session?.user?.email, parseEmailHeaders, extractEmailAddress]);

  // Fetch email details - MEMOIZED and controlled
  const fetchEmailDetails = useCallback(async () => {
    // Prevent multiple simultaneous fetches
    if (!session?.accessToken || !id || fetchedRef.current || emailIdRef.current === id) {
      return;
    }

    // Mark as fetching to prevent duplicates
    fetchedRef.current = true;
    emailIdRef.current = id;

    console.log("🔍 Fetching email details for ID:", id);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`http://localhost:8000/api/read-emails?email_id=${id}&fetch_new=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
          user_email: session.user?.email,
        }),
      });

      console.log("📡 Response status:", res.status);
      
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/api/auth/signin');
          return;
        }
        const errorText = await res.text();
        console.error("❌ Response error:", errorText);
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      console.log("📧 Backend response:", data);

      if (data.email) {
        console.log("✅ Email data found:", data.email);
        setEmail(data.email);
        setEmailHeaders(parseEmailHeaders(data.email));
        
        // Set up default reply (only once when email is loaded)
        setTimeout(() => {
          setupReplyRecipients('reply');
        }, 100);
      } else {
        console.error("❌ No email in response:", data);
        throw new Error("Email data not found in response");
      }

    } catch (err: any) {
      console.error("❌ Fetch error:", err);
      setError(`Failed to load email: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [id, session, router, parseEmailHeaders, setupReplyRecipients]);

  // Effect to handle session status and fetch email - CONTROLLED
  useEffect(() => {
    // Reset fetch control when email ID changes
    if (emailIdRef.current !== id) {
      fetchedRef.current = false;
      emailIdRef.current = null;
    }

    if (sessionStatus === "loading") {
      return; // Wait for session to load
    }

    if (sessionStatus === "unauthenticated") {
      router.push('/api/auth/signin');
      return;
    }

    if (sessionStatus === "authenticated" && !fetchedRef.current) {
      fetchEmailDetails();
    }
  }, [sessionStatus, id, router, fetchEmailDetails]);

  // Generate AI reply
  const handleGenerateWithAI = async () => {
    if (!email || !session?.accessToken || !session.user?.email || !aiPrompt.trim()) {
      setAiGenerationError("Please provide a prompt for AI generation.");
      return;
    }

    setAiGenerating(true);
    setAiGenerationError(null);

    try {
      const res = await fetch("http://localhost:8000/api/generate-email-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.accessToken,
          user_email: session.user.email,
          context: aiPrompt,
          sender: email.from,
          subject: email.subject,
          original_body: email.full_body || email.snippet,
          reply_type: replyType,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 401) {
          setAiGenerationError("Session expired. Please sign in again.");
          router.push('/api/auth/signin');
          return;
        }
        throw new Error(data.detail || 'Failed to generate email body.');
      }

      // For forwards, append to existing body; for replies, replace
      if (replyType === 'forward') {
        setReplyBody(prev => `${data.generated_body}\n\n${prev}`);
      } else {
        setReplyBody(data.generated_body);
      }
      
      setAiPrompt("");
      setAiGenerationError(null);
    } catch (err: any) {
      setAiGenerationError(`AI Generation Error: ${err.message}`);
    } finally {
      setAiGenerating(false);
    }
  };

  // Send email reply
  const handleSendReply = async () => {
    if (!email || !session?.accessToken || !replyBody.trim()) {
      setSendStatus("Error: Missing information to send reply.");
      return;
    }

    // Validate recipients based on reply type
    if (replyType !== 'forward' && !replyTo.trim()) {
      setSendStatus("Error: Please specify a recipient.");
      return;
    }

    if (replyType === 'forward' && !replyTo.trim()) {
      setSendStatus("Error: Please specify forward recipients.");
      return;
    }

    setSendStatus("Sending...");

    try {
      // Prepare Gmail-compliant headers
      const replyHeaders: any = {
        to: replyTo,
        subject: replySubject,
        body: replyBody,
        access_token: session.accessToken,
      };

      // Add CC and BCC if specified
      if (ccAddresses.trim()) {
        replyHeaders.cc = ccAddresses;
      }
      if (bccAddresses.trim()) {
        replyHeaders.bcc = bccAddresses;
      }

      // Add threading headers for proper Gmail conversation threading
      if (replyType === 'reply' || replyType === 'reply-all') {
        if (emailHeaders.messageId) {
          replyHeaders.inReplyTo = emailHeaders.messageId;
          replyHeaders.references = emailHeaders.references 
            ? `${emailHeaders.references} ${emailHeaders.messageId}`
            : emailHeaders.messageId;
        }
        if (email.threadId) {
          replyHeaders.threadId = email.threadId;
        }
      }

      const res = await fetch("http://localhost:8000/api/send-email-with-headers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replyHeaders),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setSendStatus("Error: Session expired. Please sign in again.");
          router.push('/api/auth/signin');
          return;
        }
        throw new Error(data.detail || `Failed to send email with status: ${res.status}`);
      }

      setSendStatus("✅ Email sent successfully!");
      
      // Update email status in database
      if (replyType === 'reply' || replyType === 'reply-all') {
        await updateEmailStatusInDB(email.id, 'User Replied');
        setEmail(prev => prev ? { ...prev, reply_status: "User Replied" } : null);
      }

      // Clear form and redirect
      setReplyBody("");
      setReplySubject("");
      setReplyTo("");
      setCcAddresses("");
      setBccAddresses("");
      
      setTimeout(() => {
        router.push("/emails");
      }, 1500);

    } catch (err: any) {
      setSendStatus(`❌ Error sending email: ${err.message}`);
    }
  };

  // Update email status in database
  const updateEmailStatusInDB = async (emailId: string, newReplyStatus: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/update-email-status?user_email=${session?.user?.email}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: emailId,
          reply_status: newReplyStatus,
          is_replied: true,
        }),
      });
      
      if (!res.ok) {
        console.error("Failed to update email status in DB");
      }
    } catch (err) {
      console.error("Error updating email status in DB:", err);
    }
  };

  // Send suggested reply (from AI)
  const sendSuggestedReply = async () => {
    if (!email?.suggested_reply_body) return;
    
    setReplyBody(email.suggested_reply_body);
    setupReplyRecipients('reply');
    
    // Auto-send after a brief delay to allow state update
    setTimeout(() => {
      handleSendReply();
    }, 100);
  };

  // Helper function for sentiment badge styling
  const getSentimentClass = (sentiment: string) => {
    switch (sentiment.toUpperCase()) {
      case 'POSITIVE':
        return 'bg-green-100 text-green-800';
      case 'NEGATIVE':
        return 'bg-red-100 text-red-800';
      case 'NEUTRAL':
        return 'bg-gray-100 text-gray-800';
      case 'N/A':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-500">Loading email details...</p>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600 font-medium">Error: {error}</p>
          <button 
            onClick={() => {
              fetchedRef.current = false;
              fetchEmailDetails();
            }}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render no email state
  if (!email) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">No email data found.</p>
        <Link href="/emails" className="text-blue-500 hover:underline">
          ← Back to Inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 font-sans max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Email Details</h1>
        <Link href="/emails">
          <span className="text-blue-500 hover:underline cursor-pointer">&larr; Back to Inbox</span>
        </Link>
      </div>

      {/* Email Information Section */}
      <section className="mb-8 p-6 border rounded-lg bg-white shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold">Original Message</h2>
          <div className="flex space-x-2">
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getSentimentClass(email.sentiment)}`}>
              {email.sentiment}
            </span>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {email.reply_status}
            </span>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <p><strong className="font-medium text-gray-700">From:</strong> {email.from}</p>
            <p><strong className="font-medium text-gray-700">To:</strong> {emailHeaders.to || session?.user?.email}</p>
            {emailHeaders.cc && (
              <p><strong className="font-medium text-gray-700">CC:</strong> {emailHeaders.cc}</p>
            )}
            <p><strong className="font-medium text-gray-700">Date:</strong> {email.internalDate ? new Date(parseInt(email.internalDate)).toLocaleString() : 'Unknown'}</p>
          </div>
          
          <p><strong className="font-medium text-gray-700">Subject:</strong> {email.subject}</p>
          
          <div className="mt-4 p-4 bg-gray-50 rounded-md border max-h-96 overflow-y-auto">
            <div 
              className="text-gray-800 prose max-w-none"
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(email.full_body || email.snippet) 
              }}
            />
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mb-6 p-4 border rounded-lg bg-white shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setupReplyRecipients('reply')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              replyType === 'reply' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Reply
          </button>
          <button
            onClick={() => setupReplyRecipients('reply-all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              replyType === 'reply-all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Reply All
          </button>
          <button
            onClick={() => setupReplyRecipients('forward')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              replyType === 'forward' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Forward
          </button>
          
          {email.suggested_reply_body && email.reply_status === "Pending User Review" && (
            <button
              onClick={sendSuggestedReply}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Use AI Suggestion
            </button>
          )}
        </div>
      </section>

      {/* AI Generate Reply Section */}
      <section className="mb-8 p-6 border rounded-lg bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-4">✨ Generate Reply with AI</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="aiPrompt" className="block text-sm font-medium text-gray-700 mb-2">
              How should the AI respond? (e.g., "Accept the meeting", "Decline politely", "Ask for more details")
            </label>
            <textarea
              id="aiPrompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="w-full p-3 border rounded-md focus:ring-purple-500 focus:border-purple-500 min-h-[80px]"
              placeholder="E.g., Accept the meeting invitation and suggest Tuesday afternoon as the preferred time."
              disabled={aiGenerating}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateWithAI}
              className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              disabled={!aiPrompt.trim() || aiGenerating || !email}
            >
              {aiGenerating ? "Generating..." : "Generate AI Reply"}
            </button>
            
            {email?.suggested_reply_body && (
              <button
                onClick={() => setReplyBody(email.suggested_reply_body || "")}
                className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
              >
                Load AI Suggestion
              </button>
            )}
          </div>
          {aiGenerationError && (
            <p className="text-red-600 text-sm font-medium">{aiGenerationError}</p>
          )}
        </div>
      </section>

      {/* Reply Composition Section */}
      <section className="p-6 border rounded-lg bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-4">
          ✉️ Compose {replyType === 'reply' ? 'Reply' : replyType === 'reply-all' ? 'Reply All' : 'Forward'}
        </h2>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="replyTo" className="block text-sm font-medium text-gray-700 mb-1">
                {replyType === 'forward' ? 'To:' : 'Reply To:'}
              </label>
              <input
                id="replyTo"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="recipient@example.com"
                disabled={replyType !== 'forward'}
              />
            </div>
            
            <div>
              <label htmlFor="replySubject" className="block text-sm font-medium text-gray-700 mb-1">
                Subject:
              </label>
              <input
                id="replySubject"
                type="text"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* CC and BCC fields - shown for reply-all and forward */}
          {(replyType === 'reply-all' || replyType === 'forward') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ccAddresses" className="block text-sm font-medium text-gray-700 mb-1">
                  CC:
                </label>
                <input
                  id="ccAddresses"
                  type="text"
                  value={ccAddresses}
                  onChange={(e) => setCcAddresses(e.target.value)}
                  className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="cc1@example.com, cc2@example.com"
                />
              </div>
              
              <div>
                <label htmlFor="bccAddresses" className="block text-sm font-medium text-gray-700 mb-1">
                  BCC:
                </label>
                <input
                  id="bccAddresses"
                  type="text"
                  value={bccAddresses}
                  onChange={(e) => setBccAddresses(e.target.value)}
                  className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="bcc1@example.com, bcc2@example.com"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="replyBody" className="block text-sm font-medium text-gray-700 mb-1">
              Message:
            </label>
            <textarea
              id="replyBody"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              className="w-full p-3 border rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[250px] font-mono text-sm"
              placeholder={
                aiGenerating 
                  ? "Generating AI reply..." 
                  : `Type your ${replyType} here...`
              }
              disabled={aiGenerating}
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleSendReply}
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed font-medium transition-colors"
              disabled={!replyBody.trim() || sendStatus.startsWith("Sending")}
            >
              {sendStatus.startsWith("Sending") ? "Sending..." : `Send ${replyType === 'reply' ? 'Reply' : replyType === 'reply-all' ? 'Reply All' : 'Forward'}`}
            </button>
            
            {sendStatus && (
              <p className={`font-medium ${sendStatus.startsWith("✅") ? "text-green-600" : sendStatus.startsWith("❌") ? "text-red-600" : "text-blue-600"}`}>
                {sendStatus}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}