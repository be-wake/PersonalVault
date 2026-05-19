'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Button from '@/components/Button';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
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
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--color-navy)',
          padding: '56px 24px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <path
              d="M24 4L8 10V24C8 33.6 15.2 42.4 24 44C32.8 42.4 40 33.6 40 24V10L24 4Z"
              fill="white"
            />
          </svg>
        </div>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Create your vault</h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>Secure. Private. Yours.</p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          flex: 1,
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div>
          <label
            htmlFor="name"
            style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}
          >
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="form-input"
            placeholder="Jane Smith"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="form-input"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="form-input"
            placeholder="Min. 8 characters"
          />
        </div>

        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" fullWidth loading={loading} style={{ marginTop: 8 }}>
          Create Account
        </Button>

        <p style={{ textAlign: 'center', color: 'var(--color-text-3)', fontSize: 14 }}>
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => router.push('/auth/sign-in')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-blue)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Sign in
          </button>
        </p>

        <button
          type="button"
          onClick={() => router.push('/')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-3)',
            cursor: 'pointer',
            fontSize: 13,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          ← Back
        </button>
      </form>
    </div>
  );
}
