import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { config, hasStripe } from "../lib/config.js";
import { activateSubscription, cancelSubscription, getSubscription } from "../services/billing/subscription-service.js";
import { getUsageSummary } from "../services/billing/usage-limits.js";
import {
  createCheckoutSession,
  createBillingPortalSession,
  constructEvent,
  resolveWebhookEvent,
} from "../services/billing/stripe-service.js";

export const subscriptionRouter = Router();

// GET /api/subscription — current user's subscription status + plan usage +
// Stripe availability.
subscriptionRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const [sub, usage] = await Promise.all([getSubscription(req.userId!), getUsageSummary(req.userId!)]);
  res.json({ ...sub, usage, stripeEnabled: hasStripe() });
}));

// POST /api/subscription/checkout — start a Stripe Checkout session.
// Body: { plan: "starter" | "pro" }. Returns { url } to redirect the browser to.
subscriptionRouter.post("/checkout", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  if (!hasStripe()) throw badRequest("Stripe is not configured. Use /activate in test mode.");
  const plan = String(req.body?.plan ?? "starter");
  const { url } = await createCheckoutSession(req.userId!, plan);
  res.json({ url });
}));

// POST /api/subscription/portal — open the Stripe billing portal (manage/cancel).
subscriptionRouter.post("/portal", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  if (!hasStripe()) throw badRequest("Stripe is not configured.");
  const { url } = await createBillingPortalSession(req.userId!);
  res.json({ url });
}));

// POST /api/subscription/activate — DEV/TEST trigger that simulates a completed
// payment (no Stripe required). Flips status to active, initializes user data,
// and starts the full pipeline. Disabled in production.
subscriptionRouter.post("/activate", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  if (config.isProd) throw badRequest("Manual activation is disabled in production; use Stripe checkout.");
  const { subscription, event, run } = await activateSubscription(req.userId!, {
    paymentProvider: "test",
    eventType: "dev_manual_activation",
    amountPaid: 0,
    currency: "USD",
    rawEvent: { source: "dev_activate_endpoint" },
  });
  res.json({
    message: "Subscription activated — application pipeline started",
    subscriptionStatus: subscription.status,
    eventId: event.id,
    run: { id: run.id, status: run.status, triggerType: run.triggerType },
  });
}));

// Verified Stripe webhook handler. Mounted in index.ts BEFORE express.json()
// with express.raw so the signature can be verified against the raw body.
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers["stripe-signature"];
  if (!hasStripe() || !signature || typeof signature !== "string") {
    res.status(400).json({ error: "Missing Stripe signature or Stripe not configured" });
    return;
  }
  let event;
  try {
    // req.body is a Buffer here (express.raw).
    event = constructEvent(req.body as Buffer, signature);
  } catch (err) {
    logger.warn({ err: String(err) }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  const resolved = resolveWebhookEvent(event);
  if (!resolved) {
    res.json({ received: true, handled: false });
    return;
  }

  try {
    if (resolved.cancel) {
      await cancelSubscription(resolved.userId);
      res.json({ received: true, handled: true, action: "cancelled" });
      return;
    }
    const { run } = await activateSubscription(resolved.userId, {
      paymentProvider: "stripe",
      eventType: resolved.eventType,
      planName: resolved.planSlug,
      amountPaid: resolved.amount,
      currency: resolved.currency,
      paymentCustomerId: resolved.customerId,
      subscriptionId: resolved.subscriptionId,
      rawEvent: event,
    });
    res.json({ received: true, handled: true, action: "activated", runId: run.id });
  } catch (err) {
    logger.error({ err: String(err), eventType: resolved.eventType }, "Stripe webhook handling failed");
    res.status(500).json({ error: "Webhook handler error" });
  }
}
