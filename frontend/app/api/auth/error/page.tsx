// app/auth/error/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const getErrorDetails = (error: string | null) => {
    switch (error) {
      case "Configuration":
        return {
          title: "Server Configuration Error",
          description: "There is a problem with the authentication server configuration. Please contact support.",
          canRetry: false,
        };
      case "AccessDenied":
        return {
          title: "Access Denied",
          description: "You do not have permission to sign in to this application.",
          canRetry: true,
        };
      case "Verification":
        return {
          title: "Verification Failed",
          description: "The verification link was invalid or has expired.",
          canRetry: true,
        };
      case "OAuthSignin":
        return {
          title: "OAuth Sign-in Error",
          description: "There was an error connecting to the authentication provider. This could be due to network issues or temporary service problems.",
          canRetry: true,
        };
      case "OAuthCallback":
        return {
          title: "OAuth Callback Error", 
          description: "There was an error during the authentication callback. Please try signing in again.",
          canRetry: true,
        };
      case "OAuthCreateAccount":
        return {
          title: "Account Creation Failed",
          description: "Could not create your account. Please try again or contact support if the problem persists.",
          canRetry: true,
        };
      case "EmailCreateAccount":
        return {
          title: "Email Account Creation Failed",
          description: "Could not create account with the provided email address.",
          canRetry: true,
        };
      case "Callback":
        return {
          title: "Callback Error",
          description: "There was an error in the authentication callback process.",
          canRetry: true,
        };
      case "OAuthAccountNotLinked":
        return {
          title: "Account Not Linked",
          description: "This email address is already associated with another account.",
          canRetry: false,
        };
      case "EmailSignin":
        return {
          title: "Email Sign-in",
          description: "Check your email for a sign-in link.",
          canRetry: false,
        };
      case "CredentialsSignin":
        return {
          title: "Invalid Credentials",
          description: "The credentials you provided are incorrect.",
          canRetry: true,
        };
      case "SessionRequired":
        return {
          title: "Session Required",
          description: "You must be signed in to access this page.",
          canRetry: true,
        };
      default:
        return {
          title: "Authentication Error",
          description: "An unexpected error occurred during authentication. Please try again.",
          canRetry: true,
        };
    }
  };

  const errorDetails = getErrorDetails(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            {errorDetails.title}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {errorDetails.description}
          </p>
        </div>

        {/* Error Code */}
        {error && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
            <p className="text-xs text-gray-500 text-center">
              Error Code: <span className="font-mono font-medium">{error}</span>
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-4">
          {errorDetails.canRetry && (
            <button
              onClick={() => signIn("google")}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          )}
          
          <Link
            href="/"
            className="group relative w-full flex justify-center py-3 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Go Home
          </Link>
        </div>

        {/* Troubleshooting Tips */}
        {error === "OAuthSignin" && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <svg className="w-5 h-5 text-blue-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-blue-800">
                  Troubleshooting Steps
                </h3>
                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                  <li>1. Check your internet connection</li>
                  <li>2. Clear your browser cache and cookies</li>
                  <li>3. Disable browser extensions temporarily</li>
                  <li>4. Try using an incognito/private browser window</li>
                  <li>5. Ensure third-party cookies are enabled</li>
                </ul>
                <p className="text-sm text-blue-700 mt-3">
                  If the problem persists, please contact support.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Network Issues Specific Help */}
        {error === "OAuthSignin" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <svg className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-yellow-800">
                  Network Connection Issues
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  This error often occurs due to network connectivity problems. Make sure you have a stable internet connection and that your firewall isn't blocking the request to Google's authentication servers.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}