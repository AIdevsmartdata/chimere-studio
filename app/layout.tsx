import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chimère',
  description: 'Local-first AI workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
