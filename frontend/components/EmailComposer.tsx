// components/EmailComposer.tsx
// Reusable email composition component with Gmail protocol support

"use client";

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface EmailComposerProps {
  originalEmail?: {
    id: string;
    from: string;
    subject: string;
    snippet: string;
    full_body?: string;
    threadId?: string;
    payload?: {
      headers?: Array<{
        name: string;
        value: string;
      }>;
    };
  };
  replyType?: 'reply' | 'reply-all' | 'forward' | 'new';
  onSent?: (success: boolean, messageId?: string) => void;
  onCancel?: () => void;
  className?: string;
}

interface EmailDraft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
}

export default function EmailComposer({
  originalEmail,
  replyType = 'new',
  onSent,
  onCancel,
  className = ''
}: EmailComposerProps) {
  const { data: session } = useSession();
  
  // Email composition state
  const [draft, setDraft] = useState<EmailDraft>({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    priority: 'normal'
  });

  // UI state
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string>('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Gmail headers for proper threading
  const [emailHeaders, setEmailHeaders] = useState<{
    messageId?: string;
    inReplyTo?: string;
    references?: string;
  }>({});

  // Email formatting helpers
  const extractEmailAddress = (emailString: string): string => {
    const match = emailString.match(/<([^>]+)>/);
    return match ? match[1] : emailString.trim();
  };

  const formatEmailList = (emails: string[]): string => {
    return emails.filter(email => email.trim()).join(', ');
  };

  // Parse original email headers
  useEffect(() => {
    if (originalEmail?.payload?.headers) {
      const headers: any = {};
      originalEmail.payload.headers.forEach(header => {
        const name = header.name.toLowerCase();
        switch (name) {
          case 'message-id':
            headers.messageId = header.value;
            break;
          case 'in-reply-to':
            headers.inReplyTo = header.value;
            break;
          case 'references':
            headers.references = header.value;
            break;
        }
      });
      setEmailHeaders(headers);
    }
  }, [originalEmail]);

  // Set up draft based on reply type
  useEffect(() => {
    if (!originalEmail || replyType === 'new') return;

    const userEmail = session?.user?.email?.toLowerCase();
    const fromAddress = extractEmailAddress(originalEmail.from);

    switch (replyType) {
      case 'reply':
        setDraft(prev => ({
          ...prev,
          to: fromAddress,
          subject: originalEmail.subject.startsWith('Re: ') 
            ? originalEmail.subject 
            : `Re: ${originalEmail.subject}`,
          body: `\n\n---\nOn ${new Date().toLocaleDateString()}, ${originalEmail.from} wrote:\n> ${originalEmail.snippet || originalEmail.full_body || ''}`
        }));
        break;

      case 'reply-all':
        // Extract all recipients except current user
        const allRecipients = new Set<string>();
        if (originalEmail.payload?.headers) {
          originalEmail.payload.headers.forEach(header => {
            if (header.name.toLowerCase() === 'to' || header.name.toLowerCase() === 'cc') {
              header.value.split(',').forEach(addr => {
                const cleanAddr = extractEmailAddress(addr.trim()).toLowerCase();
                if (cleanAddr !== userEmail && cleanAddr !== fromAddress.toLowerCase()) {
                  allRecipients.add(addr.trim());
                }
              });
            }
          });
        }

        setDraft(prev => ({
          ...prev,
          to: fromAddress,
          cc: Array.from(allRecipients).join(', '),
          subject: originalEmail.subject.startsWith('Re: ') 
            ? originalEmail.subject 
            : `Re: ${originalEmail.subject}`,
          body: `\n\n---\nOn ${new Date().toLocaleDateString()}, ${originalEmail.from} wrote:\n> ${originalEmail.snippet || originalEmail.full_body || ''}`
        }));
        setShowCcBcc(true);
        break;

      case 'forward':
        setDraft(prev => ({
          ...prev,
          to: '',
          subject: originalEmail.subject.startsWith('Fwd: ') 
            ? originalEmail.subject 
            : `Fwd: ${originalEmail.subject}`,
          body: `\n\n---------- Forwarded message ---------\nFrom: ${originalEmail.from}\nDate: ${new Date().toLocaleDateString()}\nSubject: ${originalEmail.subject}\n\n${originalEmail.full_body || originalEmail.snippet || ''}`
        }));
        break;
    }
  }, [originalEmail, replyType, session?.user?.email]);

  // Update draft field
  const updateDraft = (field: keyof EmailDraft, value: string) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  // Generate AI reply
  const handleAIGeneration = async () => {
    if (!aiPrompt.trim() || !session?.accessToken) {
      setSendStatus('Please provide AI instructions');
      return;
    }

    setAiGenerating(true);
    setSendStatus('Generating AI reply...');

    try {
      const response = await fetch('http://localhost:8000/api/generate-email-body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.accessToken,
          user_email: session.user?.email,
          context: aiPrompt,
          sender: originalEmail?.from || '',
          subject: originalEmail?.subject || '',
          original_body: originalEmail?.full_body || originalEmail?.snippet,
          reply_type: replyType
        })
      });

      const data = await response.json();
      if (data.success) {
        if (replyType === 'forward') {
          updateDraft('body', `${data.generated_body}\n\n${draft.body}`);
        } else {
          updateDraft('body', data.generated_body);
        }
        setAiPrompt('');
        setSendStatus('');
      } else {
        setSendStatus(`AI generation failed: ${data.detail}`);
      }
    } catch (error: any) {
      setSendStatus(`AI generation error: ${error.message}`);
    } finally {
      setAiGenerating(false);
    }
  };

  // Send email
  const handleSend = async () => {
    if (!draft.to.trim() || !draft.subject.trim() || !draft.body.trim()) {
      setSendStatus('Please fill in all required fields');
      return;
    }

    setSending(true);
    setSendStatus('Sending...');

    try {
      const emailPayload: any = {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
      };

      // Add CC and BCC if provided
      if (draft.cc.trim()) emailPayload.cc = draft.cc;
      if (draft.bcc.trim()) emailPayload.bcc = draft.bcc;

      // Add threading headers for replies
      if ((replyType === 'reply' || replyType === 'reply-all') && emailHeaders.messageId) {
        emailPayload.inReplyTo = emailHeaders.messageId;
        emailPayload.references = emailHeaders.references 
          ? `${emailHeaders.references} ${emailHeaders.messageId}`
          : emailHeaders.messageId;
      }

      if (originalEmail?.threadId) {
        emailPayload.threadId = originalEmail.threadId;
      }

      // Add access token
      emailPayload.access_token = session?.accessToken;

      const response = await fetch('http://localhost:8000/api/send-email-with-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPayload)
      });

      const data = await response.json();
      if (response.ok) {
        setSendStatus('✅ Email sent successfully!');
        onSent?.(true, data.message_id);
        
        // Clear draft after successful send
        setTimeout(() => {
          setDraft({
            to: '',
            cc: '',
            bcc: '',
            subject: '',
            body: '',
            priority: 'normal'
          });
          setSendStatus('');
        }, 2000);
      } else {
        setSendStatus(`❌ Send failed: ${data.detail}`);
        onSent?.(false);
      }
    } catch (error: any) {
      setSendStatus(`❌ Send error: ${error.message}`);
      onSent?.(false);
    } finally {
      setSending(false);
    }
  };

  // Auto-save draft (you could implement this with local storage or backend)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Auto-save logic here
      localStorage.setItem('email_draft', JSON.stringify(draft));
    }, 5000);

    return () => clearTimeout(timer);
  }, [draft]);

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-3 cursor-pointer max-w-xs"
           onClick={() => setIsMinimized(false)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium truncate">
            {replyType === 'new' ? 'New Message' : `${replyType}: ${draft.subject || 'No Subject'}`}
          </span>
          <span className="text-xs text-gray-500 ml-2">Click to expand</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-300 rounded-lg shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
        <h3 className="text-lg font-semibold capitalize">
          {replyType === 'new' ? 'New Message' : `${replyType.replace('-', ' ')}`}
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsMinimized(true)}
            className="text-gray-500 hover:text-gray-700 p-1"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 p-1"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* AI Generation Section */}
      <div className="p-4 border-b bg-purple-50">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Tell AI how to respond (e.g., 'Accept the meeting')"
            className="flex-1 p-2 border rounded-md text-sm"
            disabled={aiGenerating}
          />
          <button
            onClick={handleAIGeneration}
            disabled={!aiPrompt.trim() || aiGenerating}
            className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            {aiGenerating ? 'Generating...' : '✨ AI'}
          </button>
        </div>
      </div>

      {/* Composition Fields */}
      <div className="p-4 space-y-3">
        {/* To Field */}
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700 w-12">To:</label>
          <input
            type="email"
            value={draft.to}
            onChange={(e) => updateDraft('to', e.target.value)}
            className="flex-1 p-2 border rounded-md text-sm"
            placeholder="recipient@example.com"
            multiple
          />
          {!showCcBcc && (
            <button
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Cc/Bcc
            </button>
          )}
        </div>

        {/* CC/BCC Fields */}
        {showCcBcc && (
          <>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700 w-12">Cc:</label>
              <input
                type="email"
                value={draft.cc}
                onChange={(e) => updateDraft('cc', e.target.value)}
                className="flex-1 p-2 border rounded-md text-sm"
                placeholder="cc@example.com"
                multiple
              />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700 w-12">Bcc:</label>
              <input
                type="email"
                value={draft.bcc}
                onChange={(e) => updateDraft('bcc', e.target.value)}
                className="flex-1 p-2 border rounded-md text-sm"
                placeholder="bcc@example.com"
                multiple
              />
            </div>
          </>
        )}

        {/* Subject Field */}
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700 w-12">Subject:</label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => updateDraft('subject', e.target.value)}
            className="flex-1 p-2 border rounded-md text-sm"
            placeholder="Email subject"
          />
        </div>

        {/* Body Field */}
        <div>
          <textarea
            value={draft.body}
            onChange={(e) => updateDraft('body', e.target.value)}
            className="w-full p-3 border rounded-md text-sm min-h-[200px] font-mono"
            placeholder={aiGenerating ? 'Generating AI content...' : 'Type your message here...'}
            disabled={aiGenerating}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex items-center space-x-2">
            <select
              value={draft.priority}
              onChange={(e) => updateDraft('priority', e.target.value as 'low' | 'normal' | 'high')}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="low">Low Priority</option>
              <option value="normal">Normal</option>
              <option value="high">High Priority</option>
            </select>
            
            <button
              type="button"
              className="text-xs text-gray-600 hover:text-gray-800 flex items-center space-x-1"
              title="Attach file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <span>Attach</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {sendStatus && (
              <span className={`text-xs ${
                sendStatus.includes('✅') ? 'text-green-600' : 
                sendStatus.includes('❌') ? 'text-red-600' : 'text-blue-600'
              }`}>
                {sendStatus}
              </span>
            )}
            
            <button
              onClick={onCancel}
              className="text-gray-600 border border-gray-300 px-4 py-2 rounded-md text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            
            <button
              onClick={handleSend}
              disabled={sending || !draft.to.trim() || !draft.subject.trim() || !draft.body.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Info */}
        <div className="text-xs text-gray-500 pt-2 border-t">
          <span>💡 Tip: Ctrl+Enter to send, Ctrl+Shift+C for Cc/Bcc</span>
        </div>
      </div>
    </div>
  );
}

// Keyboard shortcuts hook
export function useEmailComposerShortcuts(
  onSend: () => void,
  onToggleCcBcc: () => void,
  isComposerOpen: boolean
) {
  useEffect(() => {
    if (!isComposerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter to send
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        onSend();
      }
      
      // Ctrl+Shift+C for Cc/Bcc
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        onToggleCcBcc();
      }
      
      // Escape to close (you could add this functionality)
      if (e.key === 'Escape') {
        // Could trigger onCancel
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSend, onToggleCcBcc, isComposerOpen]);
}