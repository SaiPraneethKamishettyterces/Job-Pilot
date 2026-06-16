import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { resolveWebhookEvent } from "./stripe-service.js";

// resolveWebhookEvent is pure (no Stripe client / network). It reads userId from
// metadata/client_reference_id and classifies activating vs cancelling events.

describe("resolveWebhookEvent", () => {
  it("resolves checkout.session.completed with metadata userId", () => {
    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "u1", planSlug: "starter" },
          client_reference_id: "u1",
          customer: "cus_123",
          subscription: "sub_123",
          amount_total: 2900,
          currency: "usd",
        },
      },
    } as unknown as Stripe.Event;

    const r = resolveWebhookEvent(event);
    expect(r).not.toBeNull();
    expect(r!.userId).toBe("u1");
    expect(r!.planSlug).toBe("starter");
    expect(r!.customerId).toBe("cus_123");
    expect(r!.cancel).toBeUndefined();
  });

  it("classifies subscription.deleted as a cancellation", () => {
    const event = {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_123", metadata: { userId: "u1" } } },
    } as unknown as Stripe.Event;

    const r = resolveWebhookEvent(event);
    expect(r?.cancel).toBe(true);
    expect(r?.userId).toBe("u1");
  });

  it("ignores events with no resolvable user", () => {
    const event = {
      type: "checkout.session.completed",
      data: { object: { metadata: {} } },
    } as unknown as Stripe.Event;
    expect(resolveWebhookEvent(event)).toBeNull();
  });

  it("ignores unrelated event types", () => {
    const event = { type: "customer.created", data: { object: {} } } as unknown as Stripe.Event;
    expect(resolveWebhookEvent(event)).toBeNull();
  });
});
