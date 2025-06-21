// /home/rick110/RickDrive/email_automation/frontend/app/api/auth/[...nextauth]/route.ts

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Custom fetch function that forces IPv4
const customFetch = async (url: string, options: any = {}) => {
  const fetchOptions = {
    ...options,
    // Force IPv4 by setting family to 4
    agent: undefined,
    headers: {
      ...options.headers,
      'User-Agent': 'NextAuth',
    },
  };
  
  // Use Node.js native fetch with custom options
  return fetch(url, fetchOptions);
};

// Enhanced token refresh with IPv4 forcing
async function refreshAccessToken(token: any) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`🔄 Attempting to refresh access token (attempt ${attempt + 1}/${maxRetries})...`);
      
      if (!token.refreshToken) {
        console.error("❌ No refresh token available");
        throw new Error("No refresh token available");
      }

      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      });

      // Use custom fetch with extended timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      console.log("🌐 Making token refresh request to Google...");
      const response = await customFetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Token refresh failed (HTTP ${response.status}):`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const refreshedTokens = await response.json();
      console.log("✅ Successfully refreshed access token");
      
      return {
        ...token,
        accessToken: refreshedTokens.access_token,
        accessTokenExpires: Date.now() + (refreshedTokens.expires_in * 1000),
        refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
        error: undefined,
      };

    } catch (error) {
      attempt++;
      console.error(`❌ Token refresh attempt ${attempt} failed:`, error);

      if (attempt >= maxRetries) {
        console.error("❌ All token refresh attempts failed");
        return { 
          ...token, 
          error: "RefreshAccessTokenError",
          accessToken: undefined,
        };
      }

      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { ...token, error: "RefreshAccessTokenError" };
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.compose'
          ].join(' '),
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: true,
        },
      },
      // Enhanced HTTP options for IPv4 preference
      httpOptions: {
        timeout: 60000, // 60 seconds
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account, trigger }) {
      if (trigger === "update") {
        console.log("🔄 Forced token refresh triggered");
        return refreshAccessToken(token);
      }

      if (account && user) {
        console.log("🔑 Initial sign in - storing tokens");
        console.log("✅ Access token received:", !!account.access_token);
        console.log("✅ Refresh token received:", !!account.refresh_token);
        console.log("📅 Token expires at:", new Date(account.expires_at! * 1000).toISOString());
        console.log("🔐 Scopes granted:", account.scope);

        return {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600000,
          user,
          error: undefined,
        };
      }

      // Check if token is still valid (with 5-minute buffer)
      const tokenValid = token.accessTokenExpires && Date.now() < (token.accessTokenExpires - 300000);
      
      if (tokenValid && !token.error) {
        return token;
      }

      console.log("🔄 Token expired or invalid, attempting refresh...");
      
      if (!token.refreshToken) {
        console.error("❌ No refresh token available for refresh");
        return { 
          ...token, 
          error: "RefreshAccessTokenError",
          accessToken: undefined 
        };
      }

      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      if (token.accessToken && !token.error) {
        session.accessToken = token.accessToken;
        session.refreshToken = token.refreshToken;
      }
      
      session.user = token.user;
      session.error = token.error;

      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/emails`;
    },
  },

  events: {
    async signIn({ user, account }) {
      console.log(`👤 User signed in: ${user.email}`);
      console.log(`🔐 Account provider: ${account?.provider}`);
    },
  },

  pages: {
    error: '/auth/error',
    signIn: '/auth/signin',
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },

  debug: process.env.NODE_ENV === 'development',
});

export { handler as GET, handler as POST };