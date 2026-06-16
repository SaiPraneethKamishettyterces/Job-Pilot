import { describe, it, expect } from "vitest";
import { config, env, hasStripe, stripeSuccessUrl } from "./config.js";

// Centralized config: safe defaults so the app boots in dev/test without a full
// .env, and the flat `env` view stays in sync with the grouped `config`.
describe("config", () => {
  it("provides safe non-secret defaults", () => {
    expect(config.server.port).toBeGreaterThan(0);
    expect(config.automation.autoSubmit).toBe(false); // prepare-only by default
    expect(["development", "test", "production"]).toContain(config.env);
  });

  it("keeps the flat env view in sync with grouped config", () => {
    expect(env.PORT).toBe(config.server.port);
    expect(env.JWT_SECRET).toBe(config.auth.jwtSecret);
    expect(env.AUTO_SUBMIT).toBe(config.automation.autoSubmit);
  });

  it("reports Stripe availability from the secret key", () => {
    expect(hasStripe()).toBe(Boolean(config.stripe.secretKey));
  });

  it("derives a Stripe success URL from the UI origin when unset", () => {
    expect(stripeSuccessUrl()).toContain("status=success");
  });
});
