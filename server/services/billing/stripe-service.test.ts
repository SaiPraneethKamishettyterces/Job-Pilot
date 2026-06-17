import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { resolveWebhookEvent, constructEvent } from "./stripe-service.js";

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

// Signature verification is the security boundary for webhooks: an attacker who
// can POST to the endpoint must not be able to forge an event.
describe("constructEvent (signature verification)", () => {
  it("refuses to verify when no webhook secret is configured (fails closed)", () => {
    // The default test env has no STRIPE_WEBHOOK_SECRET → never accept unverified.
    expect(() => constructEvent(Buffer.from("{}"), "t=1,v1=abc")).toThrow(/not configured/i);
  });

  it("rejects a tampered/forged signature when a secret IS configured", async () => {
    // Re-import the module with a secret in env so constructEvent reaches Stripe's
    // real HMAC verification, then feed it a forged signature.
    vi.resetModules();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy_test_secret_for_verification");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    try {
      const mod = await import("./stripe-service.js");
      const body = Buffer.from(JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }));
      expect(() => mod.constructEvent(body, "t=123,v1=deadbeefdeadbeef")).toThrow();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
