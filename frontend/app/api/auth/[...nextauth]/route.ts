// app/api/auth/[...nextauth]/route.ts
// MINIMAL CONFIG FOR TESTING ONLY
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  
  secret: process.env.NEXTAUTH_SECRET,
  
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url === baseUrl) return `${baseUrl}/emails`;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return baseUrl;
    },
    
    async jwt({ token, account, user }) {
      if (account && user) {
        return {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          user,
        };
      }
      return token;
    },
    
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.user = token.user;
      return session;
    },
  },
  
  debug: true,
});

export { handler as GET, handler as POST };