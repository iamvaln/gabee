/**
 * Extract client IP + UA from a request. Behind Traefik, the client IP is the
 * FIRST hop of X-Forwarded-For (subsequent hops are proxies). NEVER log the
 * returned ip.
 */
export function getRequestMeta(req: { headers: Headers }): { ip: string | null; ua: string | null } {
  const xff = req.headers.get('x-forwarded-for');
  const ip = xff
    ? (xff.split(',')[0]?.trim() || null)
    : (req.headers.get('x-real-ip')?.trim() || null);
  const ua = req.headers.get('user-agent')?.trim() || null;
  return { ip, ua };
}
