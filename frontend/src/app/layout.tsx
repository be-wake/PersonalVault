import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import ErrorBoundary from '@/components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'Personal Data Vault',
  description: 'Store, control, and selectively share your personal data.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* C11 — catches render errors anywhere in the tree */}
        <ErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
