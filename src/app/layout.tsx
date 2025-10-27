import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chef Stacks",
  description: "Generate recipe cards from YouTube videos",
  icons: {
    icon: [
      { url: '/favicon.ico?v=999999', sizes: '128x128' },
      { url: '/favicon-1760039909.png?v=999999', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/images/Favicon.png?v=999999',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                // Suppress Next.js HMR messages in development
                const originalLog = console.log;
                const originalInfo = console.info;
                
                console.log = function(...args) {
                  const message = args.join(' ');
                  if (message.includes('[Fast Refresh]') || 
                      message.includes('hot-reloader') || 
                      message.includes('report-hmr')) {
                    return;
                  }
                  originalLog.apply(console, args);
                };
                
                console.info = function(...args) {
                  const message = args.join(' ');
                  if (message.includes('[Fast Refresh]') || 
                      message.includes('hot-reloader') || 
                      message.includes('report-hmr')) {
                    return;
                  }
                  originalInfo.apply(console, args);
                };
              `,
            }}
          />
        )}
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}