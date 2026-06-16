import { describe, it, expect } from "vitest";
import { mapFillCodeToStatus } from "./status-map.js";

describe("mapFillCodeToStatus", () => {
  it("maps a successful submit to APPLIED", () => {
    expect(mapFillCodeToStatus("submitted")).toBe("APPLIED");
  });

  it("maps blockers to their handoff statuses (never bypassed)", () => {
    expect(mapFillCodeToStatus("captcha")).toBe("CAPTCHA_REQUIRED");
    expect(mapFillCodeToStatus("login")).toBe("LOGIN_REQUIRED");
    expect(mapFillCodeToStatus("account_creation")).toBe("LOGIN_REQUIRED");
    expect(mapFillCodeToStatus("otp")).toBe("QUESTION_NEEDS_REVIEW");
    expect(mapFillCodeToStatus("question")).toBe("QUESTION_NEEDS_REVIEW");
  });

  it("maps a filled-but-unsubmitted form to READY_FOR_USER_SUBMIT", () => {
    expect(mapFillCodeToStatus("form_filled")).toBe("READY_FOR_USER_SUBMIT");
  });

  it("maps missing automation runtime to ASSISTED_REQUIRED", () => {
    expect(mapFillCodeToStatus("unavailable")).toBe("ASSISTED_REQUIRED");
  });

  it("maps technical errors to FAILED_TECHNICAL", () => {
    expect(mapFillCodeToStatus("no_submit_button")).toBe("FAILED_TECHNICAL");
    expect(mapFillCodeToStatus("no_confirmation")).toBe("FAILED_TECHNICAL");
    expect(mapFillCodeToStatus("error")).toBe("FAILED_TECHNICAL");
  });
});
