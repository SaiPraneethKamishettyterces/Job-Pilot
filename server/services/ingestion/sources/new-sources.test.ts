import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJobicy } from "./jobicy.js";
import { fetchHimalayas } from "./himalayas.js";
import { fetchWorkingNomads } from "./workingnomads.js";
import { fetchWeWorkRemotely } from "./weworkremotely.js";
import { fetchBreezy, fetchTeamtailor } from "../ats-sources.js";
import { parseRssItems, toIso } from "./rss.js";

function mockJson(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body, text: async () => "" })));
}
function mockText(text: string, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => ({}), text: async () => text })));
}

afterEach(() => vi.unstubAllGlobals());

// Every new source MUST map a posting timestamp -> RawJob.postedAt (ISO). That's
// the core acceptance criterion for the "fresh jobs + time-of-release" goal.
function expectIso(s: string | null) {
  expect(s).toBeTruthy();
  expect(Number.isNaN(Date.parse(s!))).toBe(false);
}

describe("fetchJobicy", () => {
  it("maps jobs and carries pubDate -> postedAt", async () => {
    mockJson({ jobs: [{ id: 1, jobTitle: "SRE", companyName: "Acme", jobGeo: "USA", jobDescription: "<p>Run things</p>", url: "https://jobicy.com/j/1", pubDate: "2026-06-20T10:00:00Z", jobType: ["full-time"] }] });
    const jobs = await fetchJobicy();
    expect(jobs[0]).toMatchObject({ source: "jobicy", title: "SRE", company: "Acme" });
    expect(jobs[0]!.descriptionText).toContain("Run things");
    expectIso(jobs[0]!.postedAt);
  });
  it("returns [] on 404", async () => { mockJson({}, false); expect(await fetchJobicy()).toEqual([]); });
});

describe("fetchHimalayas", () => {
  it("maps jobs and converts epoch pubDate -> ISO postedAt", async () => {
    mockJson({ jobs: [{ guid: "h1", title: "Designer", companyName: "Beta", description: "<p>Design</p>", applicationLink: "https://himalayas.app/j/h1", pubDate: 1_718_000_000, locationRestrictions: ["US", "EU"] }] });
    const jobs = await fetchHimalayas();
    expect(jobs[0]).toMatchObject({ source: "himalayas", title: "Designer", company: "Beta", locationRaw: "US, EU" });
    expectIso(jobs[0]!.postedAt);
  });
});

describe("fetchWorkingNomads", () => {
  it("maps an array payload and carries pub_date", async () => {
    mockJson([{ id: 9, title: "PM", company_name: "Gamma", url: "https://workingnomads.com/j/9", description: "<p>Lead</p>", pub_date: "2026-06-19T00:00:00Z", location: "Remote" }]);
    const jobs = await fetchWorkingNomads();
    expect(jobs[0]).toMatchObject({ source: "workingnomads", title: "PM", company: "Gamma" });
    expectIso(jobs[0]!.postedAt);
  });
});

describe("fetchWeWorkRemotely", () => {
  it("parses RSS items, splits 'Company: Role', and maps pubDate", async () => {
    const rss = `<rss><channel>
      <item><title>Acme Inc: Senior Engineer</title><link>https://weworkremotely.com/jobs/123</link>
        <pubDate>Mon, 16 Jun 2026 12:00:00 +0000</pubDate><description><![CDATA[<p>Build</p>]]></description><guid>123</guid></item>
    </channel></rss>`;
    mockText(rss);
    const jobs = await fetchWeWorkRemotely();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]).toMatchObject({ source: "weworkremotely", company: "Acme Inc", title: "Senior Engineer" });
    expectIso(jobs[0]!.postedAt);
  });
});

describe("fetchBreezy", () => {
  it("maps Breezy json and carries published_date", async () => {
    mockJson([{ id: "b1", name: "QA Engineer", location: { city: "Austin", country: { name: "USA" } }, description: "<p>Test</p>", url: "https://acme.breezy.hr/p/b1", published_date: "2026-06-18T00:00:00Z", type: { name: "Full-Time" } }]);
    const jobs = await fetchBreezy("acme");
    expect(jobs[0]).toMatchObject({ source: "breezy", title: "QA Engineer", company: "acme", commitment: "Full-Time" });
    expectIso(jobs[0]!.postedAt);
  });
  it("returns [] on 404", async () => { mockJson({}, false); expect(await fetchBreezy("nope")).toEqual([]); });
});

describe("fetchTeamtailor", () => {
  it("maps JSON:API data[] shape and carries created-at", async () => {
    mockJson({ data: [{ id: "t1", attributes: { title: "Recruiter", body: "<p>Hire</p>", "created-at": "2026-06-15T00:00:00Z", "apply-url": "https://acme.teamtailor.com/jobs/t1" } }] });
    const jobs = await fetchTeamtailor("acme");
    expect(jobs[0]).toMatchObject({ source: "teamtailor", title: "Recruiter", company: "acme" });
    expectIso(jobs[0]!.postedAt);
  });
});

describe("rss helpers", () => {
  it("parseRssItems handles CDATA + Atom link href", () => {
    const items = parseRssItems(`<feed><entry><title>X</title><link href="https://e/1"/><published>2026-06-01T00:00:00Z</published><summary>hi</summary><id>1</id></entry></feed>`);
    expect(items[0]).toMatchObject({ title: "X", link: "https://e/1", guid: "1" });
  });
  it("toIso returns null for garbage and ISO for valid", () => {
    expect(toIso("not a date")).toBeNull();
    expectIso(toIso("Mon, 16 Jun 2026 12:00:00 +0000"));
  });
});
