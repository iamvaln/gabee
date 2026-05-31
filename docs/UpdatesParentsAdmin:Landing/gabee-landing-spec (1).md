# Gabee — Landing & Legal Spec v0.1

The public-facing surface on `gabee.app` — landing page, Terms & Conditions, and Privacy Policy. Companion to `product-spec-v0.1.md`, `gabee-design-spec.md`, `gabee-admin-spec.md` (the inbox + GDPR sides), and `gabee-parent-spec.md` (signup destination).

**Conventions**
- Same state vocabulary as other specs.
- Flows numbered `L#`; screens numbered per-section (LP1, LP2…).
- The landing is **fully bilingual FR / EN** from day one. Sample copy in this spec is shown in both languages; final wording is a copywriter decision, not a spec one.
- T&C and Privacy sections (§8, §9) define **structure and intent**, not binding legal text. Final wording requires a lawyer — particularly because **Cameroon's law 2024/017** on data protection applies (compliance deadline June 2026) and minors' data is involved.

---

## 1. Purpose & audience

The landing has one job: **explain what Gabee is and convert curious parents to sign up**. Education comes before conversion because the proposition has several layers — bilingual learning, foundational *and* digital skills, parent visibility — that deserve more than a glance.

**Audience**: bilingual parents (FR + EN), age 25-45 typically, with children 6-8 years old. Geographically open from launch, but the cultural reference points (school levels, examples) tilt to a francophone-Africa default that the EN side mirrors faithfully.

**Not the audience**: kids themselves (no kid would land on the landing; the kid app is at `kids.gabee.app` and is paired by the parent), educators / institutions (admin spec §15 reserves the educator surface for later).

**Conversion target**: parent signs up at `parents.gabee.app/signup`. The landing is the *only* funnel surface; there's no separate landing for ads or marketing campaigns at launch.

---

## 2. Information architecture & navigation

A **single long-scroll page** with anchored sections, plus a sticky top bar.

### 2.1 Top bar (persistent across the page)

```
[Ga-bee logo (deep teal)]   How it works   Free   FAQ   Contact      [FR/EN]   [Sign in]   [Sign up free]
```

- Anchor links scroll to sections (smooth scroll).
- **Sign up free** is the primary CTA (deep teal button — `--landing-cta`, see §5; persistent — visible from the moment the page loads).
- **Sign in** is a secondary action for returning parents.
- **FR/EN toggle** swaps the page language (localized URLs `/fr/*` and `/en/*` via `next-intl`).

At narrow widths, the link group collapses behind a hamburger; **Sign up free** stays in the bar.

### 2.2 Page sections in scroll order

1. **Hero** (§3.1) — the elevator pitch.
2. **What Gabee does** (§3.2) — the 5 modules.
3. **How it works** (§3.3) — the parent's 3-step journey.
4. **Four things that matter** (§3.4) — the value props.
5. **Free for families** (§3.5) — pricing & access.
6. **FAQ** (§3.6) — addresses the natural questions.
7. **Contact** (§3.7) — structured form.
8. **Footer** (§3.8) — legal links, language, attribution.

---

## 3. The page sections

### 3.1 Hero

**Layout**: split — illustration on one side (mascot in **deep teal**, **micro-animation**: occasional wing flutter, slow blink), copy on the other. Single-column at narrow widths (illustration above copy).

**Content** (illustrative; final copy = copywriter):

- **Headline**, large, Mulish 800:
  - *FR*: « Garder l'esprit vif. Construire les compétences qui comptent. »
  - *EN*: "A sharp mind. The skills that matter."
- **Sub-headline**, Mulish 600, two lines max:
  - *FR*: « Gabee est un outil d'apprentissage pour les enfants de 6 à 8 ans : vocabulaire, calcul, logique du code, frappe au clavier — en français et en anglais. »
  - *EN*: "Gabee is a learning tool for 6-8 year-olds: vocabulary, math, coding logic, keyboard typing — in French and English."
- **CTAs**: **Sign up free** (primary, deep teal — `--landing-cta`) · **How it works** (secondary, ghost button anchor to §3.3).
- **Reassurance line**, small, below the CTAs: « Gratuit, jusqu'à 3 enfants. » / "Free, up to 3 children."

**Screens & states**: `LP1 · Hero` — `Default`, `Loading` (skeleton if any async).

### 3.2 What Gabee does

**Layout**: section header + a row of **5 module cards** (one per module). Wraps to 2 columns then 1 at narrower widths.

**Section header**:
- *FR*: « Cinq compétences. Une seule abeille. »
- *EN*: "Five skills. One bee."

**Per module card** (all bilingual, all use the module's own color from `gabee-design-spec.md §4.1`):

| Module | Card title (FR / EN) | One-line description (FR / EN) |
|---|---|---|
| Numbers (blue) | Les nombres / Numbers | Compter, additionner, soustraire. / Counting, adding, subtracting. |
| Words (magenta) | Les mots / Words | Vocabulaire, lecture, phrases. / Vocabulary, reading, sentences. |
| Keyboard (ochre) | Le clavier / Keyboard | Apprendre à taper, doucement. / Learning to type, gently. |
| Code (violet) | Le code / Code | Premiers pas de programmation. / First steps in coding. |
| Translation (terracotta) | La traduction / Translation | Passer du français à l'anglais et retour. / Moving between French and English. |

Each card has a small abstract icon (no real bee, no photos — line illustrations in the module's color), the card title, and the one-liner.

**Below the cards**, a short line:
- *FR*: « Votre enfant renforce ses compétences dans les deux langues. »
- *EN*: "Your child strengthens their skills in both languages."

**Screens**: `LP2 · Modules` — `Default`.

### 3.3 How it works

**Layout**: section header + **4 numbered steps** in a horizontal row (vertical stack at narrow widths). Each step has an illustration (small mascot expressions) and a short caption.

**Section header**:
- *FR*: « En quatre étapes. »
- *EN*: "Four steps."

**Steps**:

1. **Sign up & add your kids**
   - *FR*: « Créez votre compte. Ajoutez vos enfants — prénom, âge, ce que vous aimeriez qu'ils travaillent. »
   - *EN*: "Create your account. Add your kids — first name, age, what you'd like them to focus on."
   - Mascot: idle.

2. **Set up Gabee on the family device, once**
   - *FR*: « Installez Gabee une fois sur l'ordinateur ou la tablette de la maison. Ensuite, vos enfants l'ouvrent, choisissent leur profil, et jouent. Pas de mot de passe pour eux. »
   - *EN*: "Set up Gabee once on the home computer or tablet. After that, your kids open it, pick their profile, and play. No password for them."
   - Mascot: focus (looking up).

3. **Stay close to their day**
   - *FR*: « Chaque jour, un petit email vous dit ce que vos enfants ont fait. Vous restez proches de leur apprentissage, deux minutes à la fois. »
   - *EN*: "Each day, a short email tells you what your kids have been doing. You stay close to their learning, two minutes at a time."
   - Mascot: focus.

4. **Leave them a word**
   - *FR*: « Un petit mot, à tout moment. À leur prochaine session, votre enfant verra : "Papa t'a laissé un mot." Ils le lisent, et ça les motive. »
   - *EN*: "A short message, anytime. At their next session, your child will see: "Papa left you a note." They read it, and it makes their day."
   - Mascot: celebrate.

**Screens**: `LP3 · How it works` — `Default`.

### 3.4 Quatre choses qui comptent / Four things that matter

**Layout**: section header + **4 short value props** in a 2×2 grid (1 column at narrow widths). Each prop = an icon, a heading, two sentences.

**Section header**:
- *FR*: « Quatre choses qui comptent. »
- *EN*: "Four things that matter."

**Value props**:

1. **Des compétences pour aujourd'hui et demain / Skills for today and tomorrow**
   - *FR*: « Vocabulaire et calcul, mais aussi premières bases de codage et frappe au clavier. Votre enfant construit les compétences fondamentales et numériques que le monde qui vient lui demandera. »
   - *EN*: "Vocabulary and math, but also first steps in coding and keyboard typing. Your child builds the foundational and digital skills the coming world will ask of them."

2. **Bilingue, à leur rythme / Truly bilingual, at their own pace**
   - *FR*: « À chaque session, votre enfant choisit sa langue. En français ou en anglais, il apprend réellement dans les deux. »
   - *EN*: "At each session, your child picks their language. In French or English, they actually learn in both."

3. **Vous voyez ce qui se passe / You see what's happening**
   - *FR*: « Quel module il préfère, où il progresse, où il bloque, combien de temps il joue — et dans quelle langue. Pas de badges qui le félicitent pour rien : de vraies informations pour vous. »
   - *EN*: "Which module they prefer, where they progress, where they get stuck, how long they play — and in which language. No badges cheering them for nothing: real information for you."

4. **Conçu avec respect / Designed with respect**
   - *FR*: « Sessions de durée raisonnable, aucune publicité, aucun achat dans l'app. Le temps que votre enfant passe ici sert son apprentissage. »
   - *EN*: "Sensible session lengths, no ads, no in-app purchases. The time your child spends here serves their learning."

**Screens**: `LP4 · Four things that matter` — `Default`.

### 3.5 Free for families

**Layout**: section header + a single large card.

**Section header**:
- *FR*: « Gratuit pour les familles. »
- *EN*: "Free for families."

**Card content**:

- Large headline: **0 €** / **Free** with subline « jusqu'à 3 enfants » / "up to 3 children".
- A small note below:
  - *FR*: « Plus de 3 enfants à la maison ? Écrivez-nous. »
  - *EN*: "More than 3 kids at home? Get in touch."
- Primary CTA: **Sign up free** (deep teal — `--landing-cta`).

**Screens**: `LP5 · Pricing` — `Default`.

### 3.6 FAQ

**Layout**: section header + accordion list (collapsed by default, one open at a time).

**Section header**:
- *FR*: « Questions courantes. »
- *EN*: "Common questions."

**Questions** (sample list — to be tuned by the copywriter; each is FR + EN):

1. **À quel âge ça s'adresse ?** / **What ages is it for?**
   - 6-8 ans typiquement. La progression s'adapte au niveau de l'enfant. / Typically 6-8 years old. The progression adapts to the child's level.

2. **Français ou anglais ?** / **French or English?**
   - Les deux. Votre enfant choisit sa langue au début de chaque session. / Both. Your child picks the language at the start of each session.

3. **Ça marche hors-ligne ?** / **Does it work offline?**
   - Oui, l'app enfant fonctionne entièrement hors-ligne. Les données se synchronisent quand la connexion revient. / Yes, the kid app works entirely offline. Data syncs when the connection comes back.

4. **Et le temps d'écran ?** / **What about screen time?**
   - Gabee a des limites de session intégrées et un suivi du temps dans le tableau de bord parent. / Gabee has built-in session caps and time tracking in the parent dashboard.

5. **Comment je supprime mes données ?** / **How do I delete my data?**
   - Un bouton dans **Réglages → Supprimer le compte**. On supprime tout sous 30 jours. / One button in **Settings → Delete account**. Everything is wiped within 30 days.

6. **Est-ce que ça restera gratuit ?** / **Will it stay free?**
   - Aujourd'hui, Gabee est gratuit. On sera transparent si jamais quelque chose change. / Today, Gabee is free. We'll be transparent if anything ever changes.

7. **Plusieurs parents pour les mêmes enfants ?** / **Two parents sharing kids?**
   - Oui : invitez l'autre parent par email depuis vos réglages. / Yes — invite the other parent by email from your settings.

8. **Qui voit les données de mon enfant ?** / **Who sees my child's data?**
   - Vous (et le co-parent si invité). Personne d'autre — pas de publicitaires, pas de tiers. / You (and your co-parent if invited). Nobody else — no advertisers, no third parties.

**Screens**: `LP6 · FAQ` — `Default`, `Disabled` (when the accordion is interacting).

### 3.7 Contact

**Layout**: section header + structured form.

**Section header**:
- *FR*: « Une question ? Écrivez-nous. »
- *EN*: "A question? Write to us."

**Form fields**:

1. **I am** — single select:
   - *FR*: « Je suis : parent · éducateur · journaliste · partenaire · autre »
   - *EN*: "I am: parent · educator · journalist · partner · other"
2. **Name** — text.
3. **Email** — email validation.
4. **Subject** — text, optional.
5. **Message** — textarea, required, min 10 chars.
6. **Submit** (deep teal — `--landing-cta`).

**On submit**:
- Submission writes to `InboxMessage` (admin spec §12), with one extra field `i_am`.
- Acknowledgment screen: "Thanks — we'll get back to you within a few days." / « Merci — on revient vers vous d'ici quelques jours. » with a mascot in celebrate expression.

**Anti-spam**:
- Honeypot field (hidden input that must remain empty).
- Rate limit per IP (5 submissions / hour) — server-side enforcement.
- No CAPTCHA for the launch (friction); revisit if spam volume justifies it.

**Screens**: `LP7 · Contact form` (`Default`, `Loading`, `Error`, `Disabled` after submit) + `LP8 · Acknowledgment`.

### 3.8 Footer

**Layout**: three short columns at wide widths, stacked at narrow.

**Columns**:

1. **Product** — How it works · Free · FAQ · Sign up · Sign in
2. **Legal** — Terms (§8) · Privacy (§9) · Cookies (single line, link if a cookies page becomes needed) · Contact (§3.7)
3. **About** — A one-line: « Gabee est conçu par Proxia Labs. » / "Gabee is crafted by Proxia Labs." (Proxia Digital, the legal entity, is named only in the Terms and Privacy pages.)

**Bottom strip**:
- Language toggle FR / EN (duplicate of the top-bar one, useful at end of scroll).
- Copyright line: © Proxia Labs `<year>`.
- Tiny mascot illustration (honey, idle expression).

---

## 4. Bilingual behavior

- **URLs**: `gabee.app/fr/*` and `gabee.app/en/*` (via `next-intl` localized routes — already in the stack, product spec §11). The bare root `gabee.app/` redirects to one based on `Accept-Language` (default FR).
- **Switching language**: changes the URL prefix; the page content swaps; cookie `NEXT_LOCALE` persists the preference.
- **SEO**: each locale has its own `<title>`, `<meta description>`, `<link rel="alternate" hreflang="...">` cross-references between `/fr/*` and `/en/*` pages.
- **Translation quality**: neither side should read like a machine translation of the other. The copywriter writes each side natively (a real Gabee voice in FR and EN), and reviewers cross-check.
- **All static**: every section's copy ships at build time; no runtime CMS for MVP.

---

## 5. Landing visual identity

Same Gabee tokens as the rest of the system. The landing is the **public face of the brand** — the first impression for parents who don't know Gabee yet. Unlike the kid app (which uses honey), the landing leans on **deep teal** throughout for an edu-mature, trustworthy feel:

- **Wordmark**: full bee-as-g lockup, **deep teal** body (`#0E7C7B` / `--landing-cta`); "abee" set in Mulish 800 ink.
- **Mascot illustrations**: deep teal body (`#0E7C7B`), cyan eyes, ink visor, light-cyan wings, dark stripes — identical to `gabee-design-spec.md §2` except the body color.
- **CTAs**: deep teal (`--landing-cta`), as detailed below.
- **App icon / favicon / OG images**: deep teal mascot, per `gabee-design-spec.md §10` guidance applied with the deep teal body.
- **Expression system**: `gabee-design-spec.md §3` — idle (default in hero), focus (step 2 in §3.3), celebrate (step 3 in §3.3 + contact acknowledgment).
- **Module colors**: from `gabee-design-spec.md §4.1`, used on the §3.2 module cards (each card keeps its module's color, unchanged).
- **Typography, radii, spacing, motion**: per `gabee-design-spec.md` unchanged.

**Landing CTA token.**

- **`--landing-cta: #0E7C7B`** (deep teal) — used for the mascot body, the wordmark "g", every primary call-to-action on the landing, and the language-toggle active state. White text on this background.
- Rationale: the landing is the public face, where the brand needs authority and seriousness without losing warmth. Honey reads playful (fitting the kid app, where the child is the user). For a parent-facing marketing surface, deep teal sits where mature edu brands sit — calm authority. Coherent single colour for the whole landing surface.
- This token is **landing-only**. Kid app keeps honey, parent app mint, admin coral.
- Doesn't collide with anything in the existing palette: distinct from the feedback green (`#3F7A2E` is olive / forest, this is cool / blue-green), from the cyan accent (`#2BD4E6` is much brighter), and from the five module colors.

---

## 6. Screens & states (summary)

| ID | Screen | States |
|---|---|---|
| LP1 | Hero | Default, Loading |
| LP2 | Modules | Default |
| LP3 | How it works | Default |
| LP4 | Why different | Default |
| LP5 | Pricing | Default |
| LP6 | FAQ | Default (accordion behavior) |
| LP7 | Contact form | Default, Loading, Error |
| LP8 | Contact acknowledgment | Default |
| LP9 | T&C page | Default, Loading |
| LP10 | Privacy page | Default, Loading |

---

## 7. Data model additions

The landing reuses existing entities.

**Contact submissions** map to `InboxMessage` from `gabee-admin-spec.md §12`, with one additional field:

```ts
InboxMessage {
  ...existing fields from admin spec §12...
  i_am: 'parent' | 'educator' | 'journalist' | 'partner' | 'other'   // new
}
```

No newsletter is planned at this stage; if it ever becomes a feature, its data model will be added then.

---

## 8. Terms & Conditions — structure

> **Not legal text.** What follows is the structure and intent of each section. The actual binding wording must be drafted (or reviewed) by a qualified lawyer.
>
> **Legal framework Gabee operates under** (verified May 2026):
> - **Loi n° 2024/017 du 23 décembre 2024** relative à la protection des données à caractère personnel — applies to any processing on Cameroonian territory *or* concerning residents of Cameroon (so Proxia Digital is doubly within scope). **Compliance deadline: 23 juin 2026.** Sanctions under Article 54+ go up to **100 millions FCFA** (administrative), plus civil and penal liabilities.
> - **Loi n° 2010/012 du 21 décembre 2010** relative à la cybersécurité et la cybercriminalité — the underlying cybersecurity framework loi 2024/017 builds on.
> - **Loi n° 2023/007 du 25 juillet 2023** — Charte de protection des enfants en ligne (online child-protection charter). Directly relevant because Gabee processes minors' data and the kid app surface is a "service for children." Requires age-gating, abuse reporting mechanisms, and parental-guide material.
> - **The supervisory authority** (« Autorité de protection des données personnelles ») is established by loi 2024/017 but its organisation is set by future presidential decree — operational modalities (registration, notification thresholds) are pending and need re-checking before launch.

URL: `gabee.app/{locale}/terms`. Linked from the footer and from the signup form (parents must accept before signing up — checkbox in `gabee-parent-spec.md §11.1`).

**Sections to draft**:

1. **Acceptance & scope** — Who's bound, when (creating an account, using the kid app); minimum age of the **account holder** (must be an adult, parental authority over the child); civil majority in Cameroon is 21 (loi 2023/007 reference) but data-protection majority is 18 (loi 2024/017).
2. **Definitions** — Service, parent, child (« personne mineure de moins de 18 ans » per loi 2024/017), content, account, device pairing, sub-processors, *responsable du traitement* (Proxia Digital).
3. **The service** — What Gabee provides; offered "as is" without warranty; we may change features.
4. **Account & parental consent** — Eligibility (adult, parental authority); accuracy of information; security responsibility (password). **Explicit parental-consent clause**: per loi 2024/017 Article 6+, processing a minor's data is valid *only* if supported by parent / legal representative consent. The parent confirms this consent at signup and per kid added. Co-parents (each adult provides their own consent to share the child profiles).
5. **Acceptable use** — No scraping, no reverse engineering, no abuse, no attempts to compromise other accounts, no commercial reuse without consent.
6. **Children's content & data** — Parent acknowledges they hold parental authority over the child; parent accepts that Gabee stores the child's learning data per the Privacy Policy (§9); parent can withdraw consent at any time by deleting the kid profile or the account.
7. **Intellectual property** — Content (curriculum, design, code) owned by Proxia Digital; parent feedback may be reproduced anonymously for service improvement; user-submitted content (feedback text) licensed non-exclusively to Proxia Digital for service operation.
8. **Pricing & free use** — Free up to 3 children today; transparent communication if pricing changes; current users given notice before any change.
9. **Privacy** — Cross-reference to the Privacy Policy (§9 / `gabee.app/{locale}/privacy`).
10. **Sub-processors** — A named list (Supabase for database + auth; Mailgun for email); right to update the list with notice. Per loi 2024/017, transfers outside Cameroon require adequate safeguards — the policy notes Supabase's data-residency.
11. **Disclaimer of warranty** — Standard language; the service is educational support, not a substitute for school or professional advice.
12. **Limitation of liability** — Standard cap; force majeure carve-out.
13. **Termination** — Either party (parent can delete account anytime; Proxia Digital may suspend or terminate for material breach with notice).
14. **Modifications to the terms** — Notice via email to active accounts; material changes require renewed consent (re-acceptance on next sign-in — aligns with loi 2024/017 "consentement spécifique et univoque").
15. **Governing law & jurisdiction** — Cameroon law; competent courts in Cameroon (to specify with lawyer — likely tribunal de première instance de Douala if Proxia Digital is registered there).
16. **Contact** — Proxia Digital registered address (Douala), email for legal notices.

**Page screen** (LP9): single long-scroll legal page in the user's locale, with sticky table of contents at wide widths, anchors per section, print-friendly stylesheet.

---

## 9. Privacy Policy — structure

> **Not legal text.** Structure and intent only; lawyer review required.
>
> **Anchored in Cameroon law** (verified May 2026):
> - **Loi n° 2024/017 du 23 décembre 2024** is the primary framework. **Article 5** defines personal data. **Article 6 et suivants** lay out the principles of lawful processing (« consentement préalable, libre, éclairé, spécifique et univoque »). The minors' provision in Art. 6+ is the cornerstone for Gabee: *« Le consentement d'une personne mineure de moins de 18 ans est valable uniquement s'il est appuyé par celui de ses parents ou de son représentant légal. »*
> - Data-subject rights mirror international standards (access, rectification, deletion, limitation, portability).
> - **Article 54 et suivants** — sanctions (administrative up to 100M FCFA, civil, penal).
> - Compliance deadline: **23 juin 2026**.
> - **Loi n° 2023/007** (online child-protection charter) and **loi n° 2010/012** (cybersecurity) also inform this policy.

URL: `gabee.app/{locale}/privacy`. Linked from the footer, T&C, signup form, and account deletion confirmation.

**Sections to draft**:

1. **Who we are** — **Proxia Digital**, Cameroun (registered address to specify); identified as the **responsable du traitement** under loi 2024/017; contact for data-protection questions.
2. **What data we collect**, by audience:
   - **Parent**: email, first name, last name, country, UI language preference, hashed password, login metadata (IP, user agent, timestamps).
   - **Child** (« personne mineure » per loi 2024/017): first name, birthday (derived: age), avatar choice, optional school level + learning objectives (collected for Phase 3 personalization), language picked at each session.
   - **Learning data**: per session — module, level, lesson, language, start / end, questions seen, answers given, time per answer, hints used, code blocks dropped, typing keystrokes, classification (self / parent / unknown). See product spec §9.2 for the event schema.
   - **Device pairing**: device label, user-agent hint, last activity, refresh-token reference.
3. **Why we collect it**: provide the service (sync sessions across devices); show the parent what their child is doing; improve content (anonymized, via the admin review loop); operational (logs for debugging, security).
4. **Legal basis** (per loi 2024/017 Art. 6+):
   - **Parental consent** for the child's data — *the* basis under Gabee's model. The parent provides explicit consent at signup and per kid added; consent is revocable at any time (account deletion or kid removal). Per the law, this consent must be « préalable, libre, éclairé, spécifique et univoque ».
   - **Contract** for the parent's own data (necessary to provide the service).
   - **Legitimate interest** for security logs and abuse prevention, with appropriate balancing.
5. **Who we share with**:
   - **Sub-processors** (named, with confirmed regions):
     - **Supabase** (database + authentication) — **EU region**.
     - **Mailgun** (transactional + parent email delivery) — **US**.
   - **Not shared with**: advertisers, data brokers, social platforms, anyone outside the named sub-processors.
   - **International transfers**: Mailgun entails a US transfer; documented safeguards (contractual clauses, sub-processor commitments) per loi 2024/017 cross-border requirements. To be finalised with the lawyer.
6. **Co-parents**: when a parent invites a co-parent, the invited parent receives access to the shared kids' data per `gabee-parent-spec.md §8`. Each parent provides their own consent at signup; the inviting parent is responsible for choosing whom to invite.
7. **Data retention**:
   - Active accounts: data retained while the account is active.
   - Account deletion: 30-day soft-delete (recoverable), then hard-delete.
   - Inactive accounts: after 24 months of no login, parent is emailed warning of upcoming deletion; if no response, account + children data are deleted.
   - Aggregated analytics (not linked to any person) may be retained indefinitely.
8. **Data-subject rights** (per loi 2024/017; procedure: currently the admin GDPR workflow per `gabee-admin-spec.md §9`):
   - **Droit d'accès** — export of data.
   - **Droit de rectification** — correction.
   - **Droit à l'effacement** ("droit à l'oubli") — deletion.
   - **Droit à la portabilité** — machine-readable export.
   - **Droit d'opposition / limitation** — restrict processing.
   - **Droit de plainte** — right to lodge a complaint with the Cameroon supervisory authority (« Autorité de protection des données personnelles »). Proxia Digital will register with the authority and submit to audits as soon as the presidential decree establishes its operational modalities.
   - For minors, these rights are exercised by the parent / legal representative.
9. **Security**: HTTPS everywhere (enforced by `.app` HSTS preload — product spec §11); passwords hashed (Supabase Auth); database encryption at rest (Supabase managed); access controls; structured logging; incident response plan; **data-breach notification** per loi 2024/017 (timeline to specify with lawyer; the supervisory authority's notification format pending the decree).
10. **International transfers**: Supabase is hosted in the **EU**; Mailgun entails a **US transfer**; safeguards (contractual clauses, sub-processor commitments) per loi 2024/017 cross-border requirements documented in the published policy.
11. **Cookies & similar**: only essential cookies (`NEXT_LOCALE` for language, session cookie for auth). **No consent banner** — no non-essential cookies set.
12. **Changes to this policy**: how parents are notified (email + in-app banner on next sign-in for material changes); aligned with loi 2024/017 « consentement spécifique » — material changes trigger re-consent.
13. **Contact for privacy questions**: email + postal address; **Délégué à la protection des données (DPO)** — role confirmed; name + contact details published in the live privacy policy.
14. **Effective date** and version history.

**Page screen** (LP10): same layout as the T&C page (long-scroll, sticky TOC at wide widths, anchors per section, print-friendly).

---

## 10. Cross-cutting

- **Accessibility** — ≥ 44px tap targets, semantic HTML headings, focus rings, AA contrast on every text. The animated mascot has `aria-label="Gabee"` and respects `prefers-reduced-motion`. Form fields have proper labels + error live-regions.
- **i18n** — `next-intl` localized routes `/fr/*` and `/en/*`; cookie persistence; `hreflang` cross-references for SEO.
- **SEO**:
  - Localized `<title>` and `<meta description>` per page.
  - Open Graph + Twitter card meta for shares (OG image = honey mascot + wordmark on ink background, per design spec §10).
  - JSON-LD `Organization` and `WebSite` schemas.
  - Sitemap.xml at `gabee.app/sitemap.xml`, including both locales.
  - Robots.txt: allow all by default; disallow `/parents/*` and `/admin/*` (those are app surfaces, not for indexing).
- **Performance**:
  - Statically rendered (Next.js App Router with `force-static` on the marketing routes — no per-request rendering needed).
  - Image optimization via `next/image`; lazy-load below-the-fold illustrations; preload the hero illustration.
  - Mulish font subset (Latin + Latin-Extended) preloaded.
  - Critical CSS inline.
  - Lighthouse target: ≥ 95 on all four categories at launch on both `/fr` and `/en` home pages.
- **Privacy & analytics**: no third-party analytics scripts at launch (no Google Analytics, no Hotjar, no Facebook Pixel). Server-side request logs only (Next.js / Vercel logs). If analytics is added later, it will be privacy-respecting (e.g., Plausible, self-hosted) and disclosed in the Privacy Policy.

---

## 11. Future

*No additional public pages planned at this stage. Items get added here only when you decide they're needed.*

