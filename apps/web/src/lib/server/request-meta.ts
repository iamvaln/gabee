/**
 * Extract client IP + UA from a request.
 *
 * Behind Traefik the client IP is the LAST hop of X-Forwarded-For, not the first.
 * The first hop is the textbook "original client", but that only holds when a
 * trusted proxy REPLACES the header. Traefik APPENDS: a request arriving with
 * `X-Forwarded-For: 1.2.3.4` is forwarded as `1.2.3.4, <real peer>`. Reading the
 * first hop therefore records whatever the caller claims — an attacker could pin
 * any IP they like onto a device record or an auth event, making the stored IP
 * worthless for audit (and actively misleading, since it looks authoritative).
 *
 * The last hop is the peer address Traefik actually observed, so the client
 * cannot forge it. This assumes exactly one trusted hop (Traefik) in front of the
 * app, which holds here: Traefik is internet-facing (Cloudflare is
 * grey-cloud/DNS-only) and the container isn't otherwise reachable. If another
 * proxy is ever added in front, this needs a trusted-hop count instead.
 *
 * NEVER log the returned ip.
 */
export function getRequestMeta(req: { headers: Headers }): { ip: string | null; ua: string | null } {
  const xff = req.headers.get('x-forwarded-for');
  let ip: string | null = null;
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    ip = hops[hops.length - 1] ?? null;
  } else {
    ip = req.headers.get('x-real-ip')?.trim() || null;
  }
  const ua = req.headers.get('user-agent')?.trim() || null;
  return { ip, ua };
}
