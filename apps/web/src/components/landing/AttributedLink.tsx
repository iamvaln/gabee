'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { withAttribution } from './attribution';

/**
 * A landing CTA that forwards the visitor's campaign tags (`utm_*`, or the
 * external referrer host as `ref`) to the sign-up page. The server-rendered
 * `href` is the plain one, so the link works without JavaScript; the tagged
 * href is swapped in after mount, once the browser location is known.
 */
export function AttributedLink({ href, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  const [tagged, setTagged] = useState(href);
  useEffect(() => {
    setTagged(withAttribution(href, window.location, document.referrer));
  }, [href]);
  return <Link href={tagged} {...rest} />;
}
