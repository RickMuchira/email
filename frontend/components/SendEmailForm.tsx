"use client";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation"; // Import useRouter

export default function SendEmailForm() {
  const { data: session } = useSession();
  const [form, setForm] = useState({ to: "", subject: "", body: "" });
  const [status, setStatus] = useState("");
  const router = useRouter(); // Initialize router

  const sendEmail = async () => {
    if (!session?.accessToken) {
      setStatus("Error: Not authenticated. Redirecting to login...");
      router.push('/api/auth/signin'); // Redirect to login if no token
      return;
    }

    setStatus("Sending...");
    try {
      const res = await fetch("http://localhost:8000/api/send-manual-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.accessToken,
          to: form.to,
          subject: form.subject,
          body: form.body,
        }),
      });

      const data = await res.json();
      if (res.ok) { // Check res.ok for proper HTTP success (200-299)
        setStatus("✅ Email sent successfully!");
        setForm({ to: "", subject: "", body: "" }); // Clear form on success
        // Optional: Could trigger a refresh of the main email list here if desired
        // e.g., using a callback prop from parent or a global state management.
      } else {
        // Specific handling for 401 Unauthorized
        if (res.status === 401) {
          setStatus("❌ Error: Session expired. Please sign in again.");
          router.push('/api/auth/signin'); // Redirect to sign-in
        } else {
          setStatus(`❌ Error: ${data.detail || data.error || 'Unknown error'}`); // More specific error message
        }
      }
    } catch (error: any) {
      setStatus(`❌ Network Error: ${error.message}`); // Catch network errors
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <input
        type="email"
        placeholder="Recipient"
        value={form.to}
        onChange={(e) => setForm({ ...form, to: e.target.value })}
        className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
        required // HTML5 validation
      />
      <input
        type="text"
        placeholder="Subject"
        value={form.subject}
        onChange={(e) => setForm({ ...form, subject: e.target.value })}
        className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
        required // HTML5 validation
      />
      <textarea
        placeholder="Message"
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 min-h-[120px]"
        required // HTML5 validation
      />
      <button
        onClick={sendEmail}
        className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        // Disable if form fields are empty or sending is in progress
        disabled={!form.to.trim() || !form.subject.trim() || !form.body.trim() || status === "Sending..."}
      >
        Send Email
      </button>
      <p className={`text-sm ${status.startsWith('✅') ? 'text-green-600' : status.startsWith('❌') ? 'text-red-600' : 'text-gray-600'}`}>
        {status}
      </p>
    </div>
  );
}