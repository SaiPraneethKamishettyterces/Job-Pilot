// Subscription service — the trusted backend trigger for job ingestion.
//
// Activation is the single point where subscription_status becomes "active".
// It is invoked by a verified payment webhook (or, in dev, the /activate
// endpoint). On activation we: (1) flip the subscription to active, (2) record a
// subscription_event (T4) capturing WHY, (3) create an ingestion run (T3), and
// (4) fire the in-process ingestion worker. The frontend never sets this state.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { createIngestionRun } from "../ingestion/ingestion-orchestrator.js";
import { triggerFullPipeline } from "../../workers/application-pipeline.js";
import { resolvePlanRecord } from "./plan-catalog.js";

/**
 * Initialize a user's data structures so the pipeline can run. In Job-Pilot's
 * normalized schema this means ensuring the per-user UserPreference row exists
 * (Job/Application rows are created per-run by the pipeline). This replaces the
 * legacy engine's per-user BigQuery table creation with a clean relational model.
 */
export async function ensureUserInitialized(userId: string) {
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/** Mark a subscription cancelled (from a verified cancellation webhook). */
export async function cancelSubscription(userId: string) {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (!existing) return null;
  const updated = await prisma.subscription.update({
    where: { userId },
    data: { status: "cancelled", cancelAtPeriodEnd: true },
  });
  await prisma.subscriptionEvent.create({
    data: {
      userId,
      paymentProvider: existing.paymentProvider,
      eventType: "subscription_cancelled",
      oldStatus: existing.status,
      newStatus: "cancelled",
      processingStatus: "processed",
      processedAt: new Date(),
    },
  });
  logger.info({ userId }, "Subscription cancelled");
  return updated;
}

export type ActivateOptions = {
  paymentProvider?: "stripe" | "manual" | "test";
  eventType?: string;
  planSlug?: string;
  planName?: string;
  amountPaid?: number;
  currency?: string;
  paymentCustomerId?: string;
  subscriptionId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawEvent?: any;
};

/**
 * Activate a user's subscription and kick off job ingestion.
 * Returns the updated subscription, the T4 event, and the T3 run that was started.
 */
export async function activateSubscription(userId: string, opts: ActivateOptions = {}) {
  const provider = opts.paymentProvider ?? "test";

  const existing = await prisma.subscription.findUnique({ where: { userId } });
  const oldStatus = existing?.status ?? "inactive";

  // 1. Flip subscription to active (create one if absent). The tier is chosen by
  //    planSlug (from Stripe checkout metadata / dev activation); unknown → free.
  const plan = await resolvePlanRecord(opts.planSlug ?? opts.planName);
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const subscription = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId: plan.id,
      paymentProvider: provider,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    update: {
      status: "active",
      paymentProvider: provider,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  // 2. Record the subscription event (T4) — why ingestion is being triggered.
  const event = await prisma.subscriptionEvent.create({
    data: {
      userId,
      paymentProvider: provider,
      paymentCustomerId: opts.paymentCustomerId ?? null,
      subscriptionId: opts.subscriptionId ?? subscription.id,
      eventType: opts.eventType ?? "subscription_activated",
      oldStatus,
      newStatus: "active",
      planName: opts.planName ?? plan.name,
      amountPaid: opts.amountPaid ?? null,
      currency: opts.currency ?? null,
      processingStatus: "processed",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawEventJson: (opts.rawEvent ?? null) as any,
      processedAt: now,
    },
  });

  // 3. Initialize the user's data structures (idempotent), then create the run
  //    (T3) and 4. start the full pipeline (discover jobs → score → generate
  //    applications). The frontend never triggers this.
  await ensureUserInitialized(userId);
  const run = await createIngestionRun(userId, "payment_activated");
  triggerFullPipeline(run.id);

  logger.info(
    { userId, runId: run.id, oldStatus, provider },
    "Subscription activated → full application pipeline started"
  );

  return { subscription, event, run };
}

export async function getSubscription(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
  if (!sub) {
    return { status: "inactive", planName: null, currentPeriodEnd: null, paymentProvider: null };
  }
  return {
    status: sub.status,
    planName: sub.plan?.name ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    paymentProvider: sub.paymentProvider,
  };
}
