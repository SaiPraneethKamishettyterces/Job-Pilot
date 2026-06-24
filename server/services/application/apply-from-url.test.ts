import { describe, it, expect } from "vitest";
import { normalizeUrl } from "./apply-from-url.js";

describe("normalizeUrl", () => {
  it("strips protocol, www, query, hash, and trailing slash", () => {
    expect(normalizeUrl("https://www.boards.greenhouse.io/acme/jobs/123/")).toBe("boards.greenhouse.io/acme/jobs/123");
    expect(normalizeUrl("http://boards.greenhouse.io/acme/jobs/123?utm=x#apply")).toBe("boards.greenhouse.io/acme/jobs/123");
  });

  it("treats query/hash/protocol variants of the same posting as equal", () => {
    const a = normalizeUrl("https://jobs.lever.co/acme/abc?ref=email");
    const b = normalizeUrl("http://www.jobs.lever.co/acme/abc#top");
    expect(a).toBe(b);
    expect(a).toBe("jobs.lever.co/acme/abc");
  });

  it("is case-insensitive on host + path", () => {
    expect(normalizeUrl("HTTPS://Acme.WD1.MyWorkdayJobs.com/Careers/Job/123")).toBe(
      "acme.wd1.myworkdayjobs.com/careers/job/123",
    );
  });

  it("returns empty string for null/undefined/blank", () => {
    expect(normalizeUrl(null)).toBe("");
    expect(normalizeUrl(undefined)).toBe("");
    expect(normalizeUrl("   ")).toBe("");
  });

  it("handles non-URL strings without throwing", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});
