import { describe, it, expect } from "vitest";
import { detectAdapter, adapterById, ADAPTERS, type AdapterId } from "./adapter.js";

describe("detectAdapter", () => {
  it("detects currently auto-fillable platforms", () => {
    expect(detectAdapter("https://boards.greenhouse.io/acme/jobs/123").id).toBe("greenhouse");
    expect(detectAdapter("https://jobs.lever.co/acme/abc/apply").id).toBe("lever");
    expect(detectAdapter("https://jobs.ashbyhq.com/acme/xyz").id).toBe("ashby");
    expect(detectAdapter("https://acme.workable.com/j/ABC").id).toBe("workable");
  });

  it("detects login-gated portals and marks them extension-only", () => {
    const wd = detectAdapter("https://acme.wd1.myworkdayjobs.com/careers/job/123");
    expect(wd.id).toBe("workday");
    expect(wd.capabilities.requiresLogin).toBe(true);
    expect(wd.capabilities.runner).toBe("extension");
    expect(wd.capabilities.multiStep).toBe(true);

    expect(detectAdapter("https://careers.icims.com/jobs/123").id).toBe("icims");
    expect(detectAdapter("https://acme.taleo.net/careersection/x").id).toBe("taleo");
    expect(detectAdapter("https://career.successfactors.com/x").id).toBe("successfactors");
  });

  it("detects newly added public no-login boards", () => {
    expect(detectAdapter("https://jobs.smartrecruiters.com/acme/123").id).toBe("smartrecruiters");
    expect(detectAdapter("https://acme.recruitee.com/o/role").id).toBe("recruitee");
    expect(detectAdapter("https://acme.breezy.hr/p/123").id).toBe("breezy");
    expect(detectAdapter("https://career.teamtailor.com/jobs/123").id).toBe("teamtailor");
  });

  it("returns the unsupported sentinel for unknown URLs and null", () => {
    expect(detectAdapter("https://example.com/careers").id).toBe("unsupported");
    expect(detectAdapter(null).id).toBe("unsupported");
    expect(detectAdapter(undefined).capabilities.autofillSupported).toBe(false);
  });

  it("is case-insensitive on the URL", () => {
    expect(detectAdapter("HTTPS://BOARDS.GREENHOUSE.IO/x").id).toBe("greenhouse");
  });
});

describe("adapter capabilities policy", () => {
  it("NEVER allows auto-submit for any adapter (primary rule)", () => {
    for (const a of ADAPTERS) {
      expect(a.capabilities.canAutoSubmit).toBe(false);
    }
  });

  it("login-gated portals are never assigned to the server runner", () => {
    for (const a of ADAPTERS) {
      if (a.capabilities.requiresLogin) {
        expect(a.capabilities.runner).toBe("extension");
      }
    }
  });

  it("public no-login boards allow either runner", () => {
    const greenhouse = adapterById("greenhouse");
    expect(greenhouse.capabilities.requiresLogin).toBe(false);
    expect(greenhouse.capabilities.runner).toBe("either");
  });

  it("has unique ids", () => {
    const ids = ADAPTERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adapterById falls back to unsupported for an unknown id", () => {
    expect(adapterById("nope" as AdapterId).id).toBe("unsupported");
  });
});
