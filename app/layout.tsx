import type { Metadata, Viewport } from "next";
import { Public_Sans, Geist_Mono } from "next/font/google";
import "./(main)/globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover", // For notched devices (iPhone X+)
};

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
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
        className={`${publicSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
