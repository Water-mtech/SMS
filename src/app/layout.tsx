import type { Metadata, Viewport } from 'next';

import { ToastProvider } from '@/components/ui/toast';
import { school } from '@/lib/env';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${school.name} — School Manager`,
    template: `%s · ${school.name}`,
  },
  description:
    'Section-based stationery tracking, roster management and dual-ledger school fee collection.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#256a48',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="min-h-screen">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
