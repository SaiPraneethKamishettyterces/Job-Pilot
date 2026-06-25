import { describe, it, expect } from "vitest";
import { canonicalKeyFor } from "./job-normalizer.js";

describe("canonicalKeyFor (cross-source dedup)", () => {
  it("collapses the SAME role across sources, incl. Sr.↔Senior spelling", () => {
    // Same seniority, different company spelling + location string + abbreviation.
    const li = canonicalKeyFor("Acme Inc.", "Sr. Data Engineer", "Remote, US", true);
    const gh = canonicalKeyFor("Acme, Inc", "Senior Data Engineer", null, true);
    expect(li).toBe(gh);
  });

  it("keeps different seniority levels DISTINCT (experience matching)", () => {
    const senior = canonicalKeyFor("Acme", "Senior Data Engineer", "Remote", true);
    const base = canonicalKeyFor("Acme", "Data Engineer", "Remote", true);
    expect(senior).not.toBe(base);
  });

  it("keeps distinct roles distinct (backend vs frontend)", () => {
    const be = canonicalKeyFor("Acme", "Backend Engineer", "Remote", true);
    const fe = canonicalKeyFor("Acme", "Frontend Engineer", "Remote", true);
    expect(be).not.toBe(fe);
  });

  it("keeps postfix discriminators distinct (no comma truncation)", () => {
    const be = canonicalKeyFor("Acme", "Engineer, Backend", "Remote", true);
    const fe = canonicalKeyFor("Acme", "Engineer, Frontend", "Remote", true);
    expect(be).not.toBe(fe);
  });

  it("distinguishes by location when not remote", () => {
    const nyc = canonicalKeyFor("Acme", "Data Engineer", "New York, NY", false);
    const sf = canonicalKeyFor("Acme", "Data Engineer", "San Francisco, CA", false);
    expect(nyc).not.toBe(sf);
  });

  it("treats remote postings as the same location regardless of text", () => {
    const a = canonicalKeyFor("Acme", "Data Engineer", "Remote - US", true);
    const b = canonicalKeyFor("Acme", "Data Engineer", "Anywhere", true);
    expect(a).toBe(b);
  });
});
