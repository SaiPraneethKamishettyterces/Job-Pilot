import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAshby, fetchWorkable, resolveBoards, fetchBoard } from "./ats-sources.js";

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body, text: async () => "" })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchAshby", () => {
  it("maps Ashby postings into RawJob", async () => {
    mockFetchOnce({
      jobs: [
        {
          id: "j1", title: "Backend Engineer", department: "Engineering", employmentType: "FullTime",
          location: "Remote - US", isRemote: true, descriptionPlain: "Build APIs.",
          publishedAt: "2026-06-01T00:00:00Z", jobUrl: "https://jobs.ashbyhq.com/acme/j1",
          applyUrl: "https://jobs.ashbyhq.com/acme/j1/application",
        },
      ],
    });
    const jobs = await fetchAshby("acme");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "ashby", atsPlatform: "ashby", sourceJobId: "j1",
      title: "Backend Engineer", company: "acme", locationRaw: "Remote - US",
      workplaceType: "remote", commitment: "FullTime",
    });
    expect(jobs[0]!.descriptionText).toContain("Build APIs");
  });

  it("returns [] when the board is empty/404", async () => {
    mockFetchOnce({}, false);
    expect(await fetchAshby("nope")).toEqual([]);
  });
});

describe("fetchWorkable", () => {
  it("maps Workable widget jobs into RawJob", async () => {
    mockFetchOnce({
      jobs: [
        {
          shortcode: "ABC123", title: "Data Analyst", employment_type: "Full-time", telecommuting: true,
          department: "Data", url: "https://acme.workable.com/j/ABC123",
          application_url: "https://acme.workable.com/j/ABC123/apply",
          location: { city: "Austin", region: "TX", country: "United States" },
          created_at: "2026-05-20", description: "Analyze data.", requirements: "SQL, Python.",
        },
      ],
    });
    const jobs = await fetchWorkable("acme");
    expect(jobs[0]).toMatchObject({
      source: "workable", sourceJobId: "ABC123", title: "Data Analyst",
      locationRaw: "Austin, TX, United States", workplaceType: "remote", commitment: "Full-time",
    });
    expect(jobs[0]!.descriptionText).toContain("SQL");
  });
});

describe("resolveBoards", () => {
  it("casts a wide net (greenhouse, lever, ashby) for an unknown company", () => {
    const refs = resolveBoards(["SomeUnknownCo"]);
    const atsList = refs.map((r) => r.ats);
    expect(atsList).toContain("greenhouse");
    expect(atsList).toContain("lever");
    expect(atsList).toContain("ashby");
  });

  it("fetchBoard dispatches to the right adapter", async () => {
    mockFetchOnce({ jobs: [] });
    expect(await fetchBoard({ ats: "ashby", token: "x" })).toEqual([]);
  });
});
