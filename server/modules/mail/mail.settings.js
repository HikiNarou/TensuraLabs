/** Admin-editable Mail policy (stored in the `settings` table under the key "mail"). */
import { z } from 'zod';

export const RESERVED_NAMES = Object.freeze([
  'abuse', 'admin', 'administrator', 'billing', 'contact', 'dmarc', 'help', 'hello', 'hostmaster', 'info', 'legal',
  'mailer-daemon', 'marketing', 'no-reply', 'noc', 'noreply', 'postmaster', 'privacy', 'root', 'sales', 'security',
  'support', 'sysadmin', 'team', 'tensura', 'tensuralabs', 'webmaster', 'www',
]);

export const DOMAIN_PATTERN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** Local part accepted for new addresses: lowercase letters, digits, dot, dash, underscore; no leading/trailing/double dots. */
export const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export function defaultMailSettings(mailConfig) {
  return {
    domains: [...(mailConfig?.defaultDomains ?? ['tensuralabs.app'])],
    publicCreation: true,
    customNames: true,
    nameMinLength: 4,
    nameMaxLength: 32,
    randomNameLength: 10,
    reservedNames: [...RESERVED_NAMES],
    addressTtlHours: 72,
    retentionDays: 7,
    teamRetentionDays: 0,
    maxAddressesPerBrowser: 10,
    maxMessageSizeMb: 10,
    sending: { enabled: false, allowPublic: false, dailyQuota: 20 },
    announcement: { id: '', en: '' },
  };
}

const domain = z.string().trim().toLowerCase().max(253).regex(DOMAIN_PATTERN, 'Domain tidak valid (contoh: tensuralabs.app)');
const reserved = z.string().trim().toLowerCase().max(64).regex(/^[a-z0-9._-]+$/, 'Nama cadangan hanya boleh huruf kecil, angka, titik, minus, garis bawah');

export const mailSettingsSchema = z.object({
  domains: z.array(domain).min(1, 'Minimal satu domain').max(20).transform((list) => [...new Set(list)]),
  publicCreation: z.boolean(),
  customNames: z.boolean(),
  nameMinLength: z.number().int().min(1).max(32),
  nameMaxLength: z.number().int().min(3).max(64),
  randomNameLength: z.number().int().min(6).max(24),
  reservedNames: z.array(reserved).max(500).transform((list) => [...new Set(list)]),
  addressTtlHours: z.number().int().min(0).max(24 * 365),
  retentionDays: z.number().int().min(0).max(3650),
  teamRetentionDays: z.number().int().min(0).max(3650),
  maxAddressesPerBrowser: z.number().int().min(1).max(50),
  maxMessageSizeMb: z.number().int().min(1).max(25),
  sending: z.object({
    enabled: z.boolean(),
    allowPublic: z.boolean(),
    dailyQuota: z.number().int().min(0).max(5000),
  }),
  announcement: z.object({ id: z.string().trim().max(280), en: z.string().trim().max(280) }),
}).refine((value) => value.nameMinLength <= value.nameMaxLength, { message: 'Panjang minimal tidak boleh melebihi panjang maksimal', path: ['nameMinLength'] })
  .refine((value) => value.randomNameLength <= value.nameMaxLength && value.randomNameLength >= value.nameMinLength, {
    message: 'Panjang nama acak harus berada di antara panjang minimal dan maksimal', path: ['randomNameLength'],
  });
