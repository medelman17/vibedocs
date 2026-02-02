import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://vdocs.edel.sh'),
  title: {
    default: 'VibeDocs – Upload. Understand. Decide.',
    template: '%s | VibeDocs'
  },
  description: 'AI-powered NDA analysis grounded in 13,000+ annotated legal clauses. Extract risks, compare contracts, generate NDAs from battle-tested templates.',
  keywords: ['NDA analysis', 'contract review', 'AI legal', 'clause extraction', 'CUAD'],
  authors: [{ name: 'Mike Edelman', url: 'https://www.linkedin.com/in/michaeljedelman/' }],
  creator: 'Mike Edelman',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://vdocs.edel.sh',
    siteName: 'VibeDocs',
    title: 'VibeDocs – Intelligent Contract Review',
    description: 'AI-powered NDA analysis that understands risk the way you do. Grounded in 13,000+ annotated legal clauses.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VibeDocs – Intelligent Contract Review',
    description: 'AI-powered NDA analysis that understands risk the way you do. Grounded in 13,000+ annotated legal clauses.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
