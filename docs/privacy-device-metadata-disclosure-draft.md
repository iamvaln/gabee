# Privacy policy — device information (draft disclosure section)

> **INTERNAL — remove this box before publishing.**
> The *technical* disclosure for the device-metadata feature, written to be
> accurate to what the code actually does. Every factual claim here was checked
> against the code. **This is not legal advice** — a lawyer must review it.
>
> **Status (updated 2026-07-16):** a provisional `p-device` section is now **LIVE**
> in the policy (`apps/web/messages/{en,fr}.json → legal.privacy`), flagged
> "Lawyer review required" like the rest of the policy — build-in-public, in-progress.
> This draft is the fuller working copy the lawyer finalizes; when it's approved,
> replace the live `p-device` body with the final wording and drop the flag.
>
> **Recently resolved (was blocking):**
> - ✅ **Consent is now captured.** The provable-consent feature shipped (PR #18):
>   `ConsentRecord` (append-only), `terms_accepted: z.literal(true)` gating signup,
>   a server-authoritative `CURRENT_TERMS_VERSION`, and a blocking re-consent gate.
>   The "Legal basis and parental consent" section is no longer describing a target
>   state — but the lawyer still supplies the legal-basis wording.
> - ✅ **The 90-day purge is on `main`** (PR #18: `services/device-ip-retention.ts`
>   + daily `/api/cron/purge-device-ips`), so the retention promise is backed by
>   deployed code, not just decided. Confirm the cron actually fires in prod.
> - ✅ **The recorded IP is tamper-resistant** (PR #11): it's read from the trusted
>   last `X-Forwarded-For` hop, so a client can't forge the address written into the
>   history — the disclosure's IP claims are accurate.
>
> **Still needs the lawyer:** fill each **[LAWYER: …]** marker (legal basis, DSR
> procedure, sign-in-log retention period, cross-border language, effective date);
> confirm the sub-processor list + DPAs (the nightly Cloudflare R2 backup carries the
> IP tables off our servers — disclosed under "Where it's stored"); reconcile with
> the existing policy's structure/voice.
>
> **Settled:** IP retention = **90 days** (decided 2026-07-14). Erasure-on-account-
> delete is **verified** (`verify-gdpr-cascade.mts`).
>
> Reference: `docs/superpowers/specs/2026-07-10-device-metadata-collection-design.md`.

---

## Information about your child's device

When your child uses Gabee, we collect some technical information about the
device they use (for example, a phone or tablet). We collect this to keep
accounts safe, to help you and us when something goes wrong, and to understand
how Gabee is used so we can improve it. We ask for no more than we need for
those purposes, and this information is never sold, never used for advertising,
and never shared with third parties.

### What we collect

| Information | In plain terms | Why we collect it |
|---|---|---|
| **IP address** | The network address the device connects from | Protect accounts from misuse and unusual sign-ins (security / anti-abuse) — **kept 90 days, then deleted** |
| **Device identifier** | A random code we store on the device to recognise it | Manage the devices linked to your family; avoid counting the same device twice |
| **Operating system & browser** | e.g. "iOS 17", "Chrome" — and the general device type/model when available | Diagnose problems you report; know which platforms to support |
| **Screen size & display settings** | The screen dimensions and pixel density | Make sure Gabee displays correctly; understand the range of devices in use |
| **Time zone** | The device's time zone (e.g. "Europe/Paris") | Understand, in aggregate, the times of day children learn |
| **App language & version** | Whether Gabee is set to French or English, and which version is installed | Support and troubleshooting |
| **Install type** | Whether Gabee is installed as an app or opened in a browser tab | Support and troubleshooting |

This information is linked to the parent account it belongs to. We do **not**
collect precise location, contacts, photos, microphone or camera data, or
browsing activity outside Gabee.

### How we use it

- **Keeping accounts safe (security).** Detecting misuse and unusual access.
- **Helping when something breaks (support).** When you contact us about a
  problem, the device details help us reproduce and fix it.
- **Improving Gabee (analytics).** Understanding, in aggregate, which devices
  and what times of day Gabee is used — never to profile an individual child.
- **Managing your devices.** Showing and letting you unlink the devices
  connected to your family.

### How long we keep it

| Information | Retention |
|---|---|
| IP address — **device history** | **90 days**, then automatically deleted. A daily job removes the IP addresses recorded against your child's devices once they're older than 90 days, along with the last-known address of any device we haven't seen since. |
| IP address — **sign-in security log** | **Kept longer.** Each sign-in, sign-up and password reset is recorded with the address it came from, so we can investigate misuse of an account — including misuse we only discover long afterwards. We keep these records for as long as they're useful for that purpose. **[LAWYER: state a concrete period or the criteria — Art. 13(2)(a) requires one; "indefinitely" is the weak point.]** |
| Device identifier, OS/browser, screen, time zone, language, version, install type | Kept while the device record exists (refreshed to the latest values as the device is used); removed when the account is deleted |

> ✅ **INTERNAL:** the 90-day window is implemented and verified
> (`services/device-ip-retention.ts` + daily `/api/cron/purge-device-ips`). This
> is the easy-to-justify posture under storage-limitation — no special
> justification clause needed beyond the stated security purpose.

### Who can see it

Access is restricted to Gabee administrators, and is limited to what each role
needs. Raw IP addresses are visible only to a small number of senior
administrators. This information is **never** written into ordinary system logs.

### Where it's stored and how it's protected

This information is stored on our servers located in the European Union. We never
send IP addresses to an outside service to look up location — where we do that at
all, we do it on our own systems.

These providers help us run Gabee, and handle data on our behalf:

| Provider | What they do for us | What they hold |
|---|---|---|
| **Contabo** (EU) | Hosts our servers | Everything — the live database runs here |
| **Cloudflare R2** | Stores our nightly database backup | A full copy of the database, kept 14 days, then deleted. Restore-only; nothing reads it otherwise |
| **Sentry** (EU region) | Tells us when something crashes | Diagnostic reports. Configured **not** to send IP addresses; may include browser/OS and the page where the error happened |
| **Mailgun** | Sends our emails (confirmation, password reset, invitations) | Your email address and the message content |
| **Anthropic** | Helps us write lesson content | Only our content-authoring prompts — **no information about you or your child** |

Because the backup is a full copy of the database, an IP address we've deleted
from our live systems may still exist inside a backup for up to 14 days, until
that backup expires.

Access to this information is role-restricted as described above, and IP
addresses are never written into ordinary system logs.

> ⚠️ **INTERNAL — do not skip.** To be clear about what this is and isn't: the
> nightly `pg_dump` is a **backup for disaster recovery only**, with a 14-day
> retention — it is *not* a data export, and nothing reads it for analytics or
> shares it with anyone. But it is uploaded off the VPS to **Cloudflare R2**
> (`ops/backup/Dockerfile:3`, `bin/backup-loop:11` → `s3://$R2_BUCKET`), so a
> third party **stores** personal data on its infrastructure. Under GDPR that
> makes them a **processor** regardless of the restore-only purpose: it has to
> be named and covered by a DPA (Cloudflare offers a standard one). That's the
> only reason it appears in a parent-facing policy — a one-line disclosure.
> **[LAWYER: confirm the full sub-processor list (backup, error reporting,
> transactional email) and whether any puts data outside the EU/EEA — if so add
> the transfer-mechanism clause (SCCs). Also confirm the 14-day backup lag is
> acceptable against the 90-day IP retention promise, or state it as we do
> above.]**

### Your choices and rights

As the parent or guardian, you can exercise these rights on your child's behalf.
Write to us at **[privacy@gabee.app — LAWYER/OPS: confirm the address]** and we
will respond within one month.

- **Deleting this information.** When you delete your Gabee account, the device
  information described here — including your child's device IP history — is
  **permanently deleted** along with it. (A copy may persist in an encrypted
  backup for up to 14 days, until that backup expires.) One exception: the
  **sign-in security log** is kept, so that misuse of an account can still be
  investigated after the fact. **[LAWYER: this is a deliberate retention against
  an erasure request — confirm it stands under Art. 17(3) / the overriding-
  grounds test in Art. 17(1)(c), and say so here in plain words.]**
- **Seeing what we hold.** You can ask for a copy of the device information
  associated with your account.
- **Correcting it.** Most of this information is measured automatically from the
  device rather than entered by you; if something is wrong, tell us and we'll
  correct or delete it.
- **Objecting.** You can ask us to stop using this information for a given
  purpose. Where we rely on your consent, you can withdraw it at any time —
  withdrawing does not affect what we did before you withdrew.
- **Complaining.** If you're not satisfied, you can complain to your data
  protection authority (in France, the CNIL).

> ⚠️ **INTERNAL — read before publishing the erasure claim.** The *cascade* is
> true and verified: deleting the `ParentAccount` row takes `Device`,
> `DeviceIpSighting`, `ConsentRecord` and the rest with it
> (`verify-gdpr-cascade.mts`, plus `gdpr-erasure.test.ts` which fails if a new
> table is ever added without a cascade). Two caveats the wording must survive:
>
> 1. **"Delete my account" does not delete anything by itself.** It files a
>    request in the `/admin/gdpr` queue; the purge is performed **by hand** by an
>    admin (`advanceGdprStep` only timestamps the checklist). Nothing in code
>    enforces or proves it happened. The one-month promise rests entirely on a
>    human remembering. Product-owner decision 2026-07-16: keep it manual.
> 2. **The sign-in security log is anonymised on a delay, not on deletion.**
>    `AuthEventLog` is `SetNull` by design (the audit row survives), and its
>    ip/user-agent/detail are cleared by the 90-day job — so a deleted parent's
>    entries lose their PII **within 90 days of the event**, not at the instant
>    of deletion. Bounded and automatic, but not immediate.
>
> **[LAWYER: given (1), is the one-month commitment safe to publish with a manual
> queue? And is the ≤90-day lag in (2) acceptable, or must erasure scrub the auth
> log immediately (which would mean automating the purge)? Also confirm the exact
> contact address.]**

### Legal basis and parental consent

A Gabee account is held by a parent or guardian, not by a child. When you create
the account and add your child's profile, you do so as the person responsible for
them.

We rely on two grounds, depending on why we use the information — **not on
consent**:

- **Providing Gabee at all.** The device information described here is part of
  how the service works: recognising your child's device, syncing their progress
  from it, and supporting you when something goes wrong. We collect it because
  we need it to deliver what you signed up for.
- **Keeping accounts safe.** Protecting families' accounts from misuse is our
  legitimate interest. This is why we record the IP address.

Because we don't rely on consent for this, there's no toggle to switch it off:
Gabee wouldn't work correctly without it. What you can do instead is
**object** — see *Your choices and rights* — and, of course, delete your account.

> ⚠️ **INTERNAL.** Product-owner position (2026-07-16): the metadata is
> **indissociable from the service** — Gabee can't work correctly without it — so
> this rests on **contract necessity + legitimate interest, never consent**.
> That's coherent, and it's *why* there is deliberately **no toggle and no
> withdrawal control** to build: those are consent obligations (Art. 7(3)), and
> we don't invoke consent. It also sidesteps the trap of bundling "consent" into
> a mandatory T&C checkbox — that wouldn't be freely given, so it wouldn't be
> valid anyway. The measure that replaces them is **making this legible in the
> T&C**, which is the point of this section.
>
> Implemented and true: the T&C acceptance is **recorded and provable**
> (`ConsentRecord` — who / which version / when, append-only) with a blocking
> re-consent gate on a version bump. That is **contract acceptance**, not GDPR
> consent — don't let the final wording conflate the two.
>
> **[LAWYER: confirm the split. The soft spot is Art. 6(1)(b) "necessary for the
> contract", read narrowly: device id / sync / support plausibly qualify, but
> product analytics (e.g. peak playing hour) usually does NOT — a child learns
> fine without it — and lands on legitimate interest (Art. 6(1)(f)) instead.
> Either way no consent and no withdrawal control is needed; if legitimate
> interest carries analytics, document the balancing test and honour the right to
> object.]**

### Changes to this section

We may update this policy. If we make a significant change to what we collect or
why, we'll tell you by email and ask you to review it before it takes effect.

**Last updated: [DATE — set at publication]**

**[LAWYER: match this to your standard change-notification clause + versioning;
if consent is the basis for any purpose, a material change likely requires
re-consent, not just notice.]**
