import { describe, it, expect } from "vitest";
import { detectPlatform } from "./platform-detector.js";

// Ported from Job_applying_agent/tests/test_platform_detector.py.
describe("detectPlatform", () => {
  it("detects greenhouse hosts", () => {
    expect(detectPlatform("https://boards.greenhouse.io/acme/jobs/123")).toBe("greenhouse");
    expect(detectPlatform("https://job-boards.greenhouse.io/acme/jobs/123")).toBe("greenhouse");
  });

  it("detects lever hosts", () => {
    expect(detectPlatform("https://jobs.lever.co/acme/abc-123")).toBe("lever");
    expect(detectPlatform("https://jobs.lever.co/acme/abc/apply")).toBe("lever");
  });

  it("detects ashby and workable", () => {
    expect(detectPlatform("https://jobs.ashbyhq.com/acme/abc")).toBe("ashby");
    expect(detectPlatform("https://apply.workable.com/acme/j/123")).toBe("workable");
    expect(detectPlatform("https://acme.workable.com/jobs/1")).toBe("workable");
  });

  it("returns unsupported for unknown or empty urls", () => {
    expect(detectPlatform("https://careers.acme.com/123")).toBe("unsupported");
    expect(detectPlatform(null)).toBe("unsupported");
    expect(detectPlatform(undefined)).toBe("unsupported");
    expect(detectPlatform("")).toBe("unsupported");
  });
});
