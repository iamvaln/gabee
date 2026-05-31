import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // Workspace TS packages are transpiled by Next (they ship source, not built dist).
  transpilePackages: ['@gabee/types', '@gabee/db'],
  // `pg` is server-only and shouldn't be bundled.
  serverExternalPackages: ['pg'],
};

// `next-intl/plugin` wires `i18n.ts` to the server-side request configuration.
const withNextIntl = createNextIntlPlugin('./i18n.ts');

export default withNextIntl(nextConfig);
