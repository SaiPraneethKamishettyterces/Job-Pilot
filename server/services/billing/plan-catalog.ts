import { prisma } from "../../lib/db.js";

// The product's plan tiers. Pricing is in USD/month. Daily caps are the headline
// (30/50/75 per day); monthly caps are ~20 working days × the daily cap. The free
// tier lets users try the flow. `stripePriceKey` maps a tier to the configured
// Stripe price id (server/lib/config.ts → stripe.prices); free has none.
export interface PlanDef {
  slug: string;
  name: string;
  priceMonthly: number;
  applicationsPerDay: number;
  applicationsPerMonth: number;
  tailoringsPerMonth: number;
  automationEnabled: boolean;
  analyticsEnabled: boolean;
  stripePriceKey: string | null;
  highlight?: boolean;
}

export const PLAN_CATALOG: PlanDef[] = [
  {
    slug: "free", name: "Free", priceMonthly: 0,
    applicationsPerDay: 3, applicationsPerMonth: 15, tailoringsPerMonth: 15,
    automationEnabled: false, analyticsEnabled: false, stripePriceKey: null,
  },
  {
    slug: "starter", name: "Starter", priceMonthly: 29,
    applicationsPerDay: 30, applicationsPerMonth: 600, tailoringsPerMonth: 600,
    automationEnabled: true, analyticsEnabled: false, stripePriceKey: "starter",
  },
  {
    slug: "pro", name: "Pro", priceMonthly: 59,
    applicationsPerDay: 50, applicationsPerMonth: 1000, tailoringsPerMonth: 1000,
    automationEnabled: true, analyticsEnabled: true, stripePriceKey: "pro", highlight: true,
  },
  {
    slug: "max", name: "Max", priceMonthly: 99,
    applicationsPerDay: 75, applicationsPerMonth: 1500, tailoringsPerMonth: 1500,
    automationEnabled: true, analyticsEnabled: true, stripePriceKey: "max",
  },
];

export function planBySlug(slug: string | null | undefined): PlanDef | undefined {
  if (!slug) return undefined;
  return PLAN_CATALOG.find((p) => p.slug === slug.toLowerCase());
}

/** Upsert every catalog tier into the Plan table (idempotent). */
export async function ensurePlans(): Promise<void> {
  for (const p of PLAN_CATALOG) {
    const data = {
      name: p.name,
      priceMonthly: p.priceMonthly,
      applicationsPerDay: p.applicationsPerDay,
      applicationsPerMonth: p.applicationsPerMonth,
      tailoringsPerMonth: p.tailoringsPerMonth,
      automationEnabled: p.automationEnabled,
      analyticsEnabled: p.analyticsEnabled,
    };
    await prisma.plan.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...data }, update: data });
  }
}

/**
 * Resolve a Plan row for a tier slug, ensuring the catalog exists. Falls back to
 * the free tier when the slug is unknown/absent.
 */
export async function resolvePlanRecord(slug: string | null | undefined) {
  await ensurePlans();
  const def = planBySlug(slug) ?? planBySlug("free")!;
  const plan = await prisma.plan.findUnique({ where: { slug: def.slug } });
  // ensurePlans just upserted it, so this is non-null in practice.
  return plan!;
}
