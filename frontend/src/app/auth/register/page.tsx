'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await register(name, email, password);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-bg)]">
      {/* Hero */}
      <div className="bg-[var(--color-navy)] px-6 pt-14 pb-10 text-center relative overflow-hidden">
        <div className="absolute -top-16 -left-14 w-64 h-64 rounded-full bg-[var(--color-steel)]/25 blur-3xl" />
        <div className="absolute -top-10 -right-14 w-56 h-56 rounded-full bg-[var(--color-teal)]/22 blur-3xl" />
        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <path d="M24 4L8 10V24C8 33.6 15.2 42.4 24 44C32.8 42.4 40 33.6 40 24V10L24 4Z" fill="white" />
          </svg>
        </div>
        <h1 className="relative text-white text-[24px] font-extrabold mb-1">Create your vault</h1>
        <p className="text-white/65 text-[14px]">Secure. Private. Yours.</p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="-mt-4 flex-1 flex flex-col gap-4 px-6 py-8 w-full max-w-[480px] mx-auto"
      >
        <div className="bg-white border border-[var(--color-border)] rounded-[20px] p-5 shadow-[0_8px_20px_rgba(27,58,92,0.08)]">
        <div className="form-group">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name" type="text" autoComplete="name" required
            placeholder="Jane Smith"
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email" type="email" autoComplete="email" required
            placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password" type="password" autoComplete="new-password" required
            placeholder="Min. 8 characters"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <Button type="submit" variant="primary" fullWidth loading={loading} className="mt-2">
          Create Account
        </Button>
        </div>

        <p className="text-center text-[var(--color-text-3)] text-[14px]">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => router.push('/auth/sign-in')}
            className="bg-transparent border-0 text-[var(--color-blue)] font-semibold cursor-pointer text-[14px]"
          >
            Sign in
          </button>
        </p>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="bg-transparent border-0 text-[var(--color-text-3)] cursor-pointer text-[13px] text-center"
        >
          ← Back
        </button>
      </form>
    </div>
  );
}
