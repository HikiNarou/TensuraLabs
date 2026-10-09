/**
 * SSRF protection for outgoing webhooks: only public unicast destinations are allowed.
 * The hostname is resolved before every delivery and each resolved address is checked.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from '../../lib/errors.js';

const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4ToInt = (ip) => ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);

export function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const value = v4ToInt(address);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower) || lower.startsWith('2001:db8');
  }
  return true;
}

/** Validates a destination URL for the current environment policy. Throws HttpError(400). */
export async function assertSafeDestination(rawUrl, { allowPrivate = false, allowHttp = false } = {}) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw HttpError.badRequest('URL webhook harus menggunakan https://');
  if (allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw HttpError.badRequest('Tujuan webhook tidak boleh mengarah ke jaringan internal');
  }
  let addresses;
  try {
    addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw HttpError.badRequest('Host webhook tidak dapat di-resolve');
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw HttpError.badRequest('Tujuan webhook tidak boleh mengarah ke jaringan internal');
  }
  return url;
}
