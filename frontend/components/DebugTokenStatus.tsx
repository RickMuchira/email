// /home/rick110/RickDrive/email_automation/frontend/components/DebugTokenStatus.tsx

"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

export default function DebugTokenStatus() {
  const { data: session, status } = useSession();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const testGmailAccess = async () => {
    if (!session?.accessToken) {
      setTestResult("❌ No access token available");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Test Gmail API access directly
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult(`✅ Gmail API access working! Email: ${data.emailAddress}, Total messages: ${data.messagesTotal}`);
      } else {
        const errorData = await response.json();
        setTestResult(`❌ Gmail API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      setTestResult(`❌ Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const formatTokenExpiry = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isExpired = now > date;
    const timeDiff = Math.abs(date.getTime() - now.getTime());
    const minutesDiff = Math.ceil(timeDiff / (1000 * 60));
    
    return {
      date: date.toLocaleString(),
      isExpired,
      minutesUntilExpiry: isExpired ? -minutesDiff : minutesDiff,
    };
  };

  if (status === "loading") {
    return <div className="bg-gray-100 p-4 rounded">Loading session...</div>;
  }

  if (!session) {
    return <div className="bg-red-100 p-4 rounded text-red-700">No session found - please sign in</div>;
  }

  const tokenInfo = session.accessTokenExpires 
    ? formatTokenExpiry(session.accessTokenExpires)
    : null;

  return (
    <div className="bg-white border rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">🔍 Token Debug Information</h3>
      
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="font-medium">User Email:</span>
          <span className="text-gray-600">{session.user?.email || 'Not available'}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-medium">Has Access Token:</span>
          <span className={session.accessToken ? 'text-green-600' : 'text-red-600'}>
            {session.accessToken ? '✅ Yes' : '❌ No'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-medium">Has Refresh Token:</span>
          <span className={session.refreshToken ? 'text-green-600' : 'text-red-600'}>
            {session.refreshToken ? '✅ Yes' : '❌ No'}
          </span>
        </div>
        
        {tokenInfo && (
          <>
            <div className="flex justify-between">
              <span className="font-medium">Token Expires:</span>
              <span className={tokenInfo.isExpired ? 'text-red-600' : 'text-green-600'}>
                {tokenInfo.date}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="font-medium">Token Status:</span>
              <span className={tokenInfo.isExpired ? 'text-red-600' : 'text-green-600'}>
                {tokenInfo.isExpired 
                  ? `❌ Expired ${tokenInfo.minutesUntilExpiry} minutes ago` 
                  : `✅ Valid for ${tokenInfo.minutesUntilExpiry} minutes`
                }
              </span>
            </div>
          </>
        )}
        
        {session.error && (
          <div className="flex justify-between">
            <span className="font-medium">Token Error:</span>
            <span className="text-red-600">❌ {session.error}</span>
          </div>
        )}
        
        <div className="mt-4 space-y-2">
          <button
            onClick={testGmailAccess}
            disabled={testing || !session.accessToken}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {testing ? 'Testing Gmail Access...' : 'Test Gmail API Access'}
          </button>
          
          {testResult && (
            <div className={`p-3 rounded text-sm ${
              testResult.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {testResult}
            </div>
          )}
        </div>
        
        {session.accessToken && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-600">Show Token (First 50 chars)</summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs break-all">
              {session.accessToken.substring(0, 50)}...
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}