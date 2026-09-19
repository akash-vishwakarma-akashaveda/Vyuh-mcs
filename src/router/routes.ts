/** Hash routing — SRS §4.3: every screen has a shareable URL #/route?key=value. */

export interface Route {
  route: string;
  params: Record<string, string>;
}

export function parseHash(hash: string = window.location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [route, query = ''] = raw.split('?');
  const params: Record<string, string> = {};
  new URLSearchParams(query).forEach((v, k) => (params[k] = v));
  return { route: route || 'landing', params };
}

export function toHash(route: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params).toString();
  return `#/${route}${q ? `?${q}` : ''}`;
}

/**
 * ponytail: legacy path table so the 20 pre-v2 screens keep their onNavigate('/…')
 * calls. Delete the table once those screens are rewritten against SRS v2 routes.
 */
export function normalize(to: string): string {
  if (to.startsWith('#')) return to;
  if (!to.startsWith('/')) return `#/${to}`;

  const seg = to.split('/').filter(Boolean);
  switch (seg[0]) {
    case undefined: return toHash('landing');
    case 'login':
      return toHash(seg[1] === 'role' ? 'scope' : 'signin');
    case 'features': return toHash('architecture');
    case 'contact': return toHash('contact');
    case 'constellation': return toHash('fleet');
    case 'satellites':
      return seg[2] === 'parameters'
        ? toHash('parameter', { sat: seg[1], param: seg[3] })
        : toHash('satellite', { sat: seg[1] });
    case 'playback': return toHash('playback');
    case 'commanding':
      return toHash(seg[1] === 'queue' ? 'uplink' : seg[1] === 'sandbox' ? 'command' : 'procedure');
    case 'procedures': return toHash('editor', { proc: seg[1] });
    case 'analytics':
      return toHash(seg[1] === 'anomalies' ? 'anomalies' : seg[1] === 'trends' ? 'fleet' : 'forecast',
        seg[1] === 'health' ? { sat: seg[2] } : {});
    case 'mission':
      return toHash(seg[1] === 'schedule' ? 'schedule' : seg[1] === 'payload' ? 'payload' : 'plan');
    case 'config':
      return toHash('mdb', seg[2] ? { sat: seg[2] } : {});
    case 'admin':
      return toHash(seg[1] === 'users' ? 'users' : seg[1] === 'audit' ? 'audit' : 'platform');
    default:
      return toHash('fleet');
  }
}

export function navigate(to: string) {
  window.location.hash = normalize(to);
}
