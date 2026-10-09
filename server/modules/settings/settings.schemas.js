import { z } from 'zod';
import { SERVICE_ICONS } from '../../db/defaults.js';
import { hexColor, httpsUrl, imageRef, linkRef, localized, text } from '../../lib/schemas.js';

const mailOrBlank = z.string().trim().max(254).refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email tidak valid');

export const siteSettingsSchema = z.object({
  brand: z.object({ name: text(60, 2), legalName: text(120), foundedYear: z.coerce.number().int().min(1900).max(2100) }),
  theme: z.object({ accent: hexColor, accent2: hexColor, highlight: hexColor, surface: hexColor }),
  motion: z.object({ liquidTransitions: z.boolean(), ambientBubbles: z.boolean(), parallax: z.boolean(), smoothReveal: z.boolean() }),
  contact: z.object({
    email: mailOrBlank, phone: text(40), address: text(200),
    whatsapp: httpsUrl, github: httpsUrl, linkedin: httpsUrl, instagram: httpsUrl, x: httpsUrl,
  }),
  seo: z.object({ ogImage: imageRef }).extend(localized(z.object({ title: text(120, 5), description: text(320, 20) })).shape),
  announcement: z.object({ enabled: z.boolean(), href: linkRef })
    .extend(localized(z.object({ label: text(16), text: text(140) })).shape),
  sections: z.object({ squad: z.boolean(), news: z.boolean(), gallery: z.boolean(), world: z.boolean() }),
  homeBlocks: z.object({
    clients: z.boolean(), services: z.boolean(), process: z.boolean(), metrics: z.boolean(),
    testimonials: z.boolean(), faq: z.boolean(), cta: z.boolean(),
  }),
  maintenance: z.object({ enabled: z.boolean() }).extend(localized(z.object({ title: text(100, 3), text: text(400, 3) })).shape),
});

const valueLabel = z.object({ value: text(16, 1), label: text(80, 1) });

const homeLocaleSchema = z.object({
  hero: z.object({
    eyebrow: text(80), titleLead: text(60, 1), rotating: z.array(text(40, 1)).min(1).max(8), titleTail: text(80),
    lead: text(400, 10), primaryCta: text(40, 2), secondaryCta: text(40), secondaryHref: linkRef, trust: text(140),
  }),
  stats: z.array(valueLabel).max(6),
  clients: z.object({ title: text(120), items: z.array(text(40, 1)).max(30) }),
  services: z.object({
    kicker: text(40), title: text(120, 2), subtitle: text(300),
    items: z.array(z.object({
      icon: z.enum(SERVICE_ICONS), title: text(80, 2), text: text(300, 5), tags: z.array(text(30, 1)).max(6),
    })).min(1).max(12),
  }),
  process: z.object({
    kicker: text(40), title: text(120, 2), subtitle: text(300),
    steps: z.array(z.object({ title: text(60, 2), text: text(300, 5), duration: text(30) })).min(1).max(8),
  }),
  metrics: z.object({ kicker: text(40), title: text(120, 2), items: z.array(valueLabel.extend({ label: text(120, 1) })).max(8) }),
  testimonials: z.object({
    kicker: text(40), title: text(120, 2),
    items: z.array(z.object({ quote: text(400, 10), name: text(60, 2), role: text(80) })).max(12),
  }),
  faq: z.object({ kicker: text(40), title: text(120, 2), items: z.array(z.object({ q: text(200, 5), a: text(800, 5) })).max(20) }),
  cta: z.object({ title: text(120, 2), text: text(300), button: text(40, 2) }),
});

export const homeSettingsSchema = localized(homeLocaleSchema);

export const SETTINGS_SCHEMAS = Object.freeze({ site: siteSettingsSchema, home: homeSettingsSchema });
export const settingsKeySchema = z.object({ key: z.enum(Object.keys(SETTINGS_SCHEMAS)) });
