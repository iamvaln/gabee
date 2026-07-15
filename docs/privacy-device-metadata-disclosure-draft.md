# Privacy policy — device information (draft disclosure section)

> **INTERNAL — remove this box before publishing.**
> This is the *technical* disclosure for the device-metadata feature (merged to
> `main` 2026-07-10), written to be accurate to what the code actually collects.
> It is **not legal advice**. Before publishing:
> 1. Have a lawyer supply the wording at each **[LAWYER: …]** marker (legal basis,
>    parental-consent mechanism, data-subject-rights procedure, controller/contact
>    details, effective date, cross-border language).
> 2. ~~Resolve the IP-retention decision.~~ **DONE (2026-07-14): 90 days.** The
>    code now purges raw IPs after 90 days (daily cron job); this draft matches.
> 3. Reconcile with the existing policy's structure/voice.
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

This information is stored on our servers located in the European Union. IP
addresses are never sent to any outside service — including for looking up
location, which we do on our own systems. Access is role-restricted as described
above. **[LAWYER: cross-border transfer language if any applies; security-measures
statement to match your standard clause.]**

### Your choices and rights

- **Deleting this information.** When you delete your Gabee account, the device
  information described here — including the full IP-address history — is
  **permanently deleted** along with it.
- **[LAWYER: access / export / correction / objection procedure and how to
  exercise these rights; retention-vs-erasure interaction; supervisory-authority
  complaint right.]**

### Legal basis and parental consent

**[LAWYER: state the legal basis for collecting this information about a child's
device, the parental-consent mechanism (how consent is obtained from and recorded
for the parent/guardian), and how consent can be withdrawn. Note that Gabee
records device information only for accounts held by a parent/guardian who has
consented.]**

### Changes to this section

**[LAWYER: standard "we may update this policy / how we notify you" clause +
effective date.]**
