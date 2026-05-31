'use client';

import { useState } from 'react';

// Public landing contact form (admin spec §8). Posts to /api/contact (no auth) which
// creates an InboxMessage surfaced in the admin Inbox. Preserves typed content on error.
export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          subject: subject || undefined,
          message,
        }),
      });
      if (!res.ok) throw new Error('failed');
      setStatus('sent');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch {
      setStatus('error');
      setError('Could not send your message. Please try again.');
    }
  }

  if (status === 'sent') {
    return (
      <div
        className="w-full rounded-[var(--radius-lg)] border p-6 text-center"
        style={{ borderColor: 'var(--border)' }}
      >
        <p className="text-lg font-extrabold" style={{ color: 'var(--color-ink)' }}>
          Thanks — we got your message.
        </p>
        <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
          We&apos;ll get back to you by email.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-4 font-bold underline"
          style={{ color: 'var(--color-ink)' }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-2xl font-extrabold" style={{ color: 'var(--color-ink)' }}>
        Get in touch
      </h2>
      <input
        type="text"
        required
        maxLength={120}
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-[var(--radius-md)] border px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      />
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-[var(--radius-md)] border px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      />
      <input
        type="text"
        maxLength={200}
        placeholder="Subject (optional)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="rounded-[var(--radius-md)] border px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      />
      <textarea
        required
        maxLength={4000}
        rows={4}
        placeholder="How can we help?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="rounded-[var(--radius-md)] border px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      />
      {error && <p style={{ color: 'var(--feedback-retry)' }}>{error}</p>}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="rounded-[var(--radius-lg)] px-6 py-3 text-lg font-extrabold disabled:opacity-50"
        style={{ background: 'var(--color-brand)', color: 'var(--color-ink)' }}
      >
        {status === 'sending' ? '…' : 'Send message'}
      </button>
    </form>
  );
}
