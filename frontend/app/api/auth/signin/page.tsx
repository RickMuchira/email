// app/auth/signin/page.tsx
"use client";

import { getProviders, signIn, getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Provider {
  id: string;
  name: string;
  type: string;
  signinUrl: string;
  callbackUrl: string;
}

export default function SignIn() {
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const providers = await getProviders();
        setProviders(providers);
      } catch (error) {
        console.error("Failed to fetch providers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, []);

  const handleSignIn = async (providerId: string) => {
    setSigning(true);
    try {
      const result = await signIn(providerId, {
        callbackUrl: "/emails",
        redirect: true,
      });
      
      if (result?.error) {
        console.error("Sign in error:", result.error);
        setSigning(false);
      }
    } catch (error) {
      console.error("Sign in failed:", error);
      setSigning(false);
    }
  };

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case "OAuthSignin":
        return "There was an error connecting to Google. Please try again.";
      case "OAuthCallback":
        return "There was an error during the OAuth callback. Please try again.";
      case "OAuthCreateAccount":
        return "Could not create account. Please try again.";
      case "EmailCreateAccount":
        return "Could not create account with email. Please try again.";
      case "Callback":
        return "There was an error in the OAuth callback. Please try again.";
      case "OAuthAccountNotLinked":
        return "This account is already linked to another user.";
      case "EmailSignin":
        return "Check your email for a sign-in link.";
      case "CredentialsSignin":
        return "Sign in failed. Check your credentials.";
      case "SessionRequired":
        return "Please sign in to access this page.";
      case "Configuration":
        return "There is a problem with the server configuration.";
      default:
        return "An unexpected error occurred. Please try again.";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading sign-in options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Sign in to Email Automation
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Connect your Gmail account to get started
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">
                  Authentication Error
                </h3>
                <p className="text-sm text-red-700 mt-1">
                  {getErrorMessage(error)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sign-in Form */}
        <div className="mt-8 space-y-6">
          {providers && Object.values(providers).map((provider) => (
            <div key={provider.name}>
              <button
                onClick={() => handleSignIn(provider.id)}
                disabled={signing}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {signing ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  <div className="flex items-center">
                    {provider.id === "google" && (
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    )}
                    Sign in with {provider.name}
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Help Text */}
        <div className="text-center">
          <div className="text-xs text-gray-500 space-y-2">
            <p>
              By signing in, you grant access to read and send emails through your Gmail account.
            </p>
            <p>
              This is required for the email automation features to work properly.
            </p>
          </div>
        </div>

        {/* Troubleshooting */}
        {error === "OAuthSignin" && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <svg className="w-5 h-5 text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-blue-800">
                  Troubleshooting Tips
                </h3>
                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                  <li>• Check your internet connection</li>
                  <li>• Try clearing your browser cache</li>
                  <li>• Disable any ad blockers temporarily</li>
                  <li>• Make sure third-party cookies are enabled</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}