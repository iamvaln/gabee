import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import { getServerSession } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { AUTH_JWT_SECRET } from '@/lib/server/env';
import { AcceptCoparentForm } from './accept-form';

export const dynamic = 'force-dynamic';

// Co-parent invite landing — opened from the email link `?token=…`. Server
// component: decode the token, look up the invite + inviter + kids, then
// hand off to the client form which posts to /api/family/accept. If the
// requester isn't signed in we bounce to /parent/login with `?next=` so
// they come back here after auth. If their session email doesn't match the
// invite, we render an explicit mismatch screen (no auto-accept).
export default async function AcceptCoparentInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const here = `/parent/coparent/accept${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  if (!token) {
    return (
      <CenteredCard>
        <h1 style={{ margin: 0 }}>Invite link missing</h1>
        <p style={{ color: 'var(--text-2)' }}>
          The link you opened doesn’t include an invite token. Ask the parent who
          invited you to resend the email.
        </p>
      </CenteredCard>
    );
  }

  // Decode the token to find the invite id. We don't run the full
  // service-level validation here — that happens in /api/family/accept on
  // the POST. We just need enough metadata to render the confirmation +
  // route the visitor to login vs signup based on whether the invitee
  // already has a parent account.
  const inviteSecret = new TextEncoder().encode(
    process.env.COPARENT_INVITE_SECRET ?? `${AUTH_JWT_SECRET}:invite`,
  );
  let inviteId: string | null = null;
  try {
    const { payload } = await jwtVerify(token, inviteSecret);
    if (typeof payload.inviteId === 'string') inviteId = payload.inviteId;
  } catch {
    /* falls through to the not-found screen below */
  }

  const invite = inviteId
    ? await prisma.coparentInvite.findUnique({
        where: { id: inviteId },
        include: {
          inviter: {
            select: { email: true, displayNameForKids: true },
          },
        },
      })
    : null;

  // No session → either bounce to signup (no account yet) or login (account
  // exists). Parent spec §9.2 P4: new-account invitees land on the signup
  // form pre-filled with the invite email, and after registration the form
  // auto-accepts and lands them on Home with the shared kids visible.
  const session = await getServerSession();
  if (!session) {
    if (invite) {
      const existing = await prisma.parentAccount.findUnique({
        where: { email: invite.inviteeEmail.toLowerCase() },
        select: { id: true },
      });
      if (existing) {
        redirect(`/parent/login?next=${encodeURIComponent(here)}`);
      }
      redirect(
        `/parent/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.inviteeEmail)}`,
      );
    }
    redirect(`/parent/login?next=${encodeURIComponent(here)}`);
  }

  if (!invite) {
    return (
      <CenteredCard>
        <h1 style={{ margin: 0 }}>Invite not found</h1>
        <p style={{ color: 'var(--text-2)' }}>
          This invite link is invalid. It may have been cancelled or already used.
        </p>
        <a href="/parent" className="btn ghost" style={{ marginTop: 8 }}>
          Back to Gabee
        </a>
      </CenteredCard>
    );
  }

  const expired = invite.expiresAt.getTime() < Date.now() || invite.status === 'expired';
  if (expired) {
    return (
      <CenteredCard>
        <h1 style={{ margin: 0 }}>Invite expired</h1>
        <p style={{ color: 'var(--text-2)' }}>
          This invite expired on {invite.expiresAt.toDateString()}. Ask the inviter
          to send a new one.
        </p>
        <a href="/parent" className="btn ghost" style={{ marginTop: 8 }}>
          Back to Gabee
        </a>
      </CenteredCard>
    );
  }

  if (invite.status !== 'pending') {
    return (
      <CenteredCard>
        <h1 style={{ margin: 0 }}>Invite already resolved</h1>
        <p style={{ color: 'var(--text-2)' }}>
          This invite has already been {invite.status}.
        </p>
        <a href="/parent" className="btn ghost" style={{ marginTop: 8 }}>
          Back to Gabee
        </a>
      </CenteredCard>
    );
  }

  if (invite.inviteeEmail.toLowerCase() !== session.email.toLowerCase()) {
    return (
      <CenteredCard>
        <h1 style={{ margin: 0 }}>Wrong account</h1>
        <p style={{ color: 'var(--text-2)' }}>
          This invite was sent to <strong>{invite.inviteeEmail}</strong>, but
          you’re signed in as <strong>{session.email}</strong>. Sign out and
          sign back in with the invited email.
        </p>
        <a href="/parent/logout" className="btn ghost" style={{ marginTop: 8 }}>
          Sign out
        </a>
      </CenteredCard>
    );
  }

  const kids = await prisma.childProfile.findMany({
    where: { id: { in: invite.childIds } },
    select: { id: true, name: true },
  });
  const inviterName =
    invite.inviter.displayNameForKids ||
    invite.inviter.email.split('@')[0] ||
    invite.inviter.email;

  return (
    <CenteredCard>
      <h1 style={{ margin: 0, fontSize: 22 }}>You’ve been invited to Gabee</h1>
      <p style={{ color: 'var(--text-2)', fontSize: 15, lineHeight: 1.5, margin: 0 }}>
        <strong>{inviterName}</strong> invited you to co-parent
        {kids.length > 0 ? (
          <>
            {' '}
            <strong>{kids.map((k) => k.name).join(', ')}</strong>.
          </>
        ) : (
          <> their kids.</>
        )}{' '}
        You’ll see the same kids and have the same rights.
      </p>
      {invite.personalNote && (
        <blockquote
          style={{
            margin: 0,
            padding: '12px 16px',
            borderLeft: '3px solid var(--mint)',
            background: 'var(--mint-soft)',
            borderRadius: 8,
            color: 'var(--ink)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          “{invite.personalNote}”
        </blockquote>
      )}
      <AcceptCoparentForm token={token} kidCount={kids.length} />
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="page page-wide">
      <div
        className="card"
        style={{ maxWidth: 540, margin: '40px auto', padding: 0 }}
      >
        <div
          className="card-pad"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
