import type { FillCode } from "../automation/form-filler.js";

// Deterministic mapping from a browser-automation outcome code to the
// application lifecycle status. Pure + unit-tested. These are the statuses the
// UI reads to show the user exactly what happened with each job.
export type AppStatus =
  | "APPLIED"
  | "CAPTCHA_REQUIRED"
  | "LOGIN_REQUIRED"
  | "QUESTION_NEEDS_REVIEW"
  | "READY_FOR_USER_SUBMIT"
  | "ASSISTED_REQUIRED"
  | "FAILED_TECHNICAL";

export function mapFillCodeToStatus(code: FillCode): AppStatus {
  switch (code) {
    case "submitted":
      return "APPLIED";
    case "captcha":
      return "CAPTCHA_REQUIRED";
    case "login":
    case "account_creation":
      return "LOGIN_REQUIRED";
    case "otp":
    case "question":
      return "QUESTION_NEEDS_REVIEW";
    case "form_filled":
      return "READY_FOR_USER_SUBMIT";
    case "unavailable":
      return "ASSISTED_REQUIRED";
    case "no_submit_button":
    case "no_confirmation":
    case "error":
    default:
      return "FAILED_TECHNICAL";
  }
}
