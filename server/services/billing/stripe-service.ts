import Stripe from "stripe";
import { config, hasStripe, stripeSuccessUrl, stripeCancelUrl } from "../../lib/config.js";
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { badRequest } from "../../lib/errors.js";

// Stripe integration for subscriptions. The client is lazily constructed so the
// server boots without Stripe configured (dev/test can use the /activate path).
// All keys come from the centralized config — never hardcoded.

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!config.stripe.secretKey) throw badRequest("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  if (!client) client = new Stripe(config.stripe.secretKey);
  return client;
}

export { hasStripe };

/** Map a plan slug → configured Stripe price id. */
export function priceIdForPlan(slug: string): string | null {
  return config.stripe.prices[slug] ?? null;
}

/** Reverse map a Stripe price id → plan slug (for webhook → plan resolution). */
export function planForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [slug, id] of Object.entries(config.stripe.prices)) {
    if (id && id === priceId) return slug;
  }
  return null;
}

/**
 * Create a Stripe Checkout session for a subscription and return the redirect URL.
 * Reuses/creates a Stripe customer per user so the subscription is linked back.
 */
export async function createCheckoutSession(userId: string, planSlug: string): Promise<{ url: string }> {
  const priceId = priceIdForPlan(planSlug);
  if (!priceId) throw badRequest(`No Stripe price configured for plan "${planSlug}"`);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("User not found");

  const existing = await prisma.subscription.findUnique({ where: { userId } });
  const customerId =
    existing?.stripeCustomerId ??
    (await stripe().customers.create({ email: user.email, metadata: { userId } })).id;

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${stripeSuccessUrl()}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: stripeCancelUrl(),
    client_reference_id: userId,
    metadata: { userId, planSlug },
    subscription_data: { metadata: { userId, planSlug } },
  });

  if (!session.url) throw badRequest("Stripe did not return a checkout URL");
  logger.info({ userId, planSlug, sessionId: session.id }, "Stripe checkout session created");
  return { url: session.url };
}

/** Verify + parse a webhook payload. Throws on bad signature. */
export function constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
  if (!config.stripe.webhookSecret) throw badRequest("STRIPE_WEBHOOK_SECRET not configured");
  return stripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

/** Open a Stripe billing portal session so the user can manage/cancel. */
export async function createBillingPortalSession(userId: string): Promise<{ url: string }> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.stripeCustomerId) throw badRequest("No Stripe customer for this user");
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${config.server.uiOrigin}/billing`,
  });
  return { url: session.url };
}

export type ResolvedWebhook = {
  userId: string;
  eventType: string;
  customerId?: string;
  subscriptionId?: string;
  planSlug?: string;
  amount?: number;
  currency?: string;
  cancel?: boolean;
};

// Events that activate a subscription vs cancel/downgrade it.
const ACTIVATING = new Set(["checkout.session.completed", "invoice.payment_succeeded"]);
const CANCELLING = new Set(["customer.subscription.deleted"]);

/**
 * Resolve a verified Stripe event into our internal shape. Returns null for
 * events we don't act on. userId is read from metadata/client_reference_id.
 */
export function resolveWebhookEvent(event: Stripe.Event): ResolvedWebhook | null {
  const type = event.type;

  if (ACTIVATING.has(type)) {
    if (type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.["userId"] ?? s.client_reference_id ?? undefined;
      if (!userId) return null;
      return {
        userId,
        eventType: type,
        customerId: typeof s.customer === "string" ? s.customer : undefined,
        subscriptionId: typeof s.subscription === "string" ? s.subscription : undefined,
        planSlug: s.metadata?.["planSlug"],
        amount: s.amount_total ?? undefined,
        currency: s.currency ?? undefined,
      };
    }
    const inv = event.data.object as Stripe.Invoice;
    const userId = (inv.metadata?.["userId"] as string | undefined) ?? undefined;
    // Price id location varies across Stripe API/SDK versions; read defensively.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line = inv.lines?.data?.[0] as any;
    const linePrice: string | undefined =
      line?.pricing?.price_details?.price ?? line?.price?.id ?? undefined;
    if (!userId) return null;
    return {
      userId,
      eventType: type,
      customerId: typeof inv.customer === "string" ? inv.customer : undefined,
      planSlug: planForPriceId(linePrice) ?? undefined,
      amount: inv.amount_paid ?? undefined,
      currency: inv.currency ?? undefined,
    };
  }

  if (CANCELLING.has(type)) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = (sub.metadata?.["userId"] as string | undefined) ?? undefined;
    if (!userId) return null;
    return { userId, eventType: type, subscriptionId: sub.id, cancel: true };
  }

  return null;
}

export const ACTIVATING_EVENTS = ACTIVATING;
