# Privacy policy — device information (draft disclosure section)

> **INTERNAL — remove this box before publishing.**
> The *technical* disclosure for the device-metadata feature, written to be
> accurate to what the code actually does. Every factual claim here was checked
> against the code. **This is not legal advice** — a lawyer must review it.
>
> **🔴 Two blockers make this UNPUBLISHABLE as-is:**
> 1. **Consent isn't captured.** The "Legal basis and parental consent" section
>    describes a target state. The product records **no consent at all** (no
>    field, no signup step, no withdrawal control). Publishing it as written
>    would be a misrepresentation. → build the consent capture first (see that
>    section's prerequisites).
> 2. **Sub-processors need confirming.** The nightly DB backup (Cloudflare R2)
>    carries the IP tables off our servers — disclosed under "Where it's stored",
>    but the full sub-processor list + DPAs + any non-EU transfer must be
>    confirmed by the lawyer.
>
> **Then:** fill each **[LAWYER: …]** marker, set the effective date, and
> reconcile with the existing policy's structure/voice.
>
> **Settled:** IP retention = **90 days** (decided 2026-07-14; enforced by
> `services/device-ip-retention.ts` + the daily `/api/cron/purge-device-ips`).
> Erasure-on-account-delete is **verified** (`verify-gdpr-cascade.mts`).
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
| IP address | **90 days**, then automatically deleted. A daily job removes IP addresses older than 90 days — both the history and the last-known address of a device we haven't seen since. |
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

Two third-party providers do handle this data as part of running Gabee:

- **Backups.** A nightly encrypted backup of our database — which includes the
  device information described here — is stored with our backup provider
  (Cloudflare R2). Backups are kept for 14 days, then deleted. This means that
  for up to 14 days after an IP address is deleted from our live systems, a copy
  may still exist in a backup, until that backup expires.
- **Error reporting.** When something crashes we send diagnostic reports to our
  error-reporting provider (Sentry, EU region). These reports never include IP
  addresses or user-agents.

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
  information described here — including the full IP-address history — is
  **permanently deleted** along with it. (A copy may persist in an encrypted
  backup for up to 14 days, until that backup expires.)
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

> ⚠️ **INTERNAL:** the erasure claim is **true and verified** — deleting the
> `ParentAccount` cascades `Device` + `DeviceIpSighting` away (checked by
> `apps/web/scripts/verify-gdpr-cascade.mts`). Requests are handled through the
> existing `/admin/gdpr` queue, which is a **manual checklist** — there is no
> automated self-serve export/erasure. **[LAWYER: confirm the one-month response
> commitment is one we can actually meet with a manual queue, and the exact
> contact address.]**

### Legal basis and parental consent

A Gabee account is held by a parent or guardian, not by a child. When you create
the account and add your child's profile, you do so as the person responsible for
them.

We rely on two different grounds, depending on why we use the information:

- **Keeping accounts safe (security).** We rely on our legitimate interest in
  protecting families' accounts from misuse. This is the ground for collecting
  the IP address and device identifier.
- **Understanding and improving Gabee (analytics), and supporting you.** We rely
  on **your consent**, given when you set up the account. You can withdraw it at
  any time in **[Settings → …  — PRODUCT: confirm where]**, and we'll stop using
  the information for those purposes.

Withdrawing consent doesn't affect what we did before you withdrew it, and it
doesn't affect the security ground above.

> 🔴 **INTERNAL — BLOCKING, THIS IS NOT TRUE YET.** The consent story above
> describes the **target state**, not what the product does today:
> - **The parent DOES accept T&C at signup** — a required checkbox gating the
>   submit, linking to `/fr/terms` (`parent/signup/page.tsx:87,132,394`). What's
>   missing is that the acceptance is **never sent or stored**: the signup API
>   takes only `{email, password}` and no consent column exists. So today the
>   consent is **real but unprovable** — we cannot show who accepted what, when.
> - **There is no withdrawal control** in the product either.
>
> **Prerequisites before this section can be published:**
> 1. Persist the acceptance already collected at signup — **who / when / which
>    version** (in progress: `ConsentRecord` history table).
> 2. A re-consent gate when a new T&C version ships (in progress: blocking
>    screen on next parent-space visit).
> 3. A withdrawal control + what withdrawal actually turns off.
>
> **[LAWYER: decide the split above — is legitimate interest defensible for
> security on a minor's IP, or should everything sit on consent? If everything
> rests on consent, note the product consequence: no consent ⇒ no device
> metadata collected at all, which the code must then enforce.]**

### Changes to this section

We may update this policy. If we make a significant change to what we collect or
why, we'll tell you by email and ask you to review it before it takes effect.

**Last updated: [DATE — set at publication]**

**[LAWYER: match this to your standard change-notification clause + versioning;
if consent is the basis for any purpose, a material change likely requires
re-consent, not just notice.]**
