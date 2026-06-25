import { describe, it, expect } from "vitest";
import { tzParts } from "./clock.js";

describe("tzParts", () => {
  it("reports hour/weekday in UTC", () => {
    const sat = new Date(Date.UTC(2026, 5, 27, 15, 30, 0)); // Sat 27 Jun 2026 15:30 UTC
    const p = tzParts("UTC", sat);
    expect(p.hour).toBe(15);
    expect(p.weekday).toBe(6); // Saturday
    expect(p.isWeekend).toBe(true);
    expect(p.dateKey).toBe("2026-06-27");
  });

  it("shifts the hour for a non-UTC timezone", () => {
    const t = new Date(Date.UTC(2026, 5, 24, 4, 0, 0)); // Wed 24 Jun 2026 04:00 UTC
    const ny = tzParts("America/New_York", t); // UTC-4 in June → 00:00
    expect(ny.hour).toBe(0);
    expect(ny.isWeekend).toBe(false);
  });

  it("falls back to UTC for an invalid timezone", () => {
    const t = new Date(Date.UTC(2026, 5, 24, 9, 0, 0));
    const p = tzParts("Not/AZone", t);
    expect(p.hour).toBe(9);
  });

  it("flags Sunday as weekend", () => {
    const sun = new Date(Date.UTC(2026, 5, 28, 12, 0, 0)); // Sun 28 Jun 2026
    expect(tzParts("UTC", sun).isWeekend).toBe(true);
  });
});
