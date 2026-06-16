import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, addJobSchema } from "./validation.js";

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    const r = signupSchema.safeParse({ email: "a@b.com", password: "longenough", name: "Ada" });
    expect(r.success).toBe(true);
  });

  it("rejects a short password", () => {
    const r = signupSchema.safeParse({ email: "a@b.com", password: "short", name: "Ada" });
    expect(r.success).toBe(false);
  });

  it("rejects a bad email", () => {
    const r = signupSchema.safeParse({ email: "nope", password: "longenough", name: "Ada" });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("allows any non-empty password (server contract is min 1)", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("addJobSchema", () => {
  it("requires either jobUrl or rawText", () => {
    expect(addJobSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a jobUrl alone", () => {
    expect(addJobSchema.safeParse({ jobUrl: "https://example.com/job" }).success).toBe(true);
  });

  it("rejects rawText shorter than 50 chars", () => {
    expect(addJobSchema.safeParse({ rawText: "too short" }).success).toBe(false);
  });
});
