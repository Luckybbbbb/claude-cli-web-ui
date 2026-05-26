import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claude CLI Web UI',
  description: 'Web interface for Claude CLI conversations',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
