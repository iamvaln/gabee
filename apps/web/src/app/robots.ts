import type { MetadataRoute } from 'next';

// Next emits this at `/robots.txt`. Allow the public marketing surface and
// block account-only subtrees + API routes. The /parent and /admin layouts
// also declare meta robots `noindex,nofollow` as a second layer for crawlers
// that ignore robots.txt (most major ones honour both).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/parent/', '/admin/', '/api/'],
      },
    ],
    sitemap: 'https://gabee.app/sitemap.xml',
    host: 'https://gabee.app',
  };
}
