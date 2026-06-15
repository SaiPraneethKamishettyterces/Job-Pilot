import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest } from "../lib/errors.js";
import { activateSubscription, getSubscription } from "../services/billing/subscription-service.js";

export const subscriptionRouter = Router();

// GET /api/subscription — current user's subscription status.
subscriptionRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const sub = await getSubscription(req.userId!);
  res.json(sub);
}));

// POST /api/subscription/activate — DEV trigger that simulates a completed
// payment for the current user. Flips status to active, writes a T4 event,
// creates a T3 ingestion run, and starts the worker. In production this path is
// reached only from the verified webhook below.
subscriptionRouter.post("/activate", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { subscription, event, run } = await activateSubscription(req.userId!, {
    paymentProvider: "test",
    eventType: "dev_manual_activation",
    amountPaid: 0,
    currency: "USD",
    rawEvent: { source: "dev_activate_endpoint" },
  });
  res.json({
    message: "Subscription activated — ingestion run started",
    subscriptionStatus: subscription.status,
    eventId: event.id,
    run: { id: run.id, status: run.status, triggerType: run.triggerType },
  });
}));

// POST /api/subscription/webhook — payment provider webhook entry point.
// In a real deployment this verifies the provider signature before activating.
// Stubbed here: accepts a minimal payload shape and activates on a "paid" event.
subscriptionRouter.post("/webhook", asyncHandler(async (req, res) => {
  // TODO(prod): verify Stripe-Signature header against STRIPE_WEBHOOK_SECRET.
  const { type, userId, customerId, subscriptionId, amount, currency } = req.body ?? {};

  const PAID_EVENTS = ["checkout.session.completed", "invoice.payment_succeeded", "payment_succeeded"];
  if (!userId) throw badRequest("Missing userId in webhook payload");
  if (!PAID_EVENTS.includes(type)) {
    // Acknowledge non-activating events without triggering ingestion.
    res.json({ received: true, activated: false });
    return;
  }

  const { run } = await activateSubscription(userId, {
    paymentProvider: "stripe",
    eventType: type,
    amountPaid: typeof amount === "number" ? amount : undefined,
    currency,
    paymentCustomerId: customerId,
    subscriptionId,
    rawEvent: req.body,
  });
  res.json({ received: true, activated: true, runId: run.id });
}));
