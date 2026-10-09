import './globals.css';
import { Fraunces, IBM_Plex_Mono, Kalam } from 'next/font/google';

const serif = Fraunces({ subsets: ['latin'], weight: ['700'], variable: '--f-serif' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--f-mono' });
const hand = Kalam({ subsets: ['latin'], weight: ['400'], variable: '--f-hand' });

export const metadata = { title: 'Accounting Pad', description: 'Practice accounting on a columnar pad' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}