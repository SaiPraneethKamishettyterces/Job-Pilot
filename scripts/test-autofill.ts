// One-off E2E test for the auto-fill engine. Picks a real Greenhouse/Stripe app,
// ensures consent, mints a JWT, and calls POST /api/applications/:id/submit so the
// live server runs the headed Playwright fill. Prints the coverage report.
// Run: npx tsx scripts/test-autofill.ts [appId]
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../server/lib/db.js";

const BASE = process.env.TEST_BASE ?? "http://localhost:3001";

async function main() {
  const wantId = process.argv[2];

  // Find candidate apps with a fillable ATS apply URL.
  const apps = await prisma.application.findMany({
    where: {
      job: { OR: [{ applyUrl: { contains: "greenhouse" } }, { applyUrl: { contains: "stripe" } }, { applyUrl: { contains: "lever" } }] },
    },
    include: { job: true },
    take: 25,
    orderBy: { createdAt: "desc" },
  });

  if (!apps.length) {
    console.log("No Greenhouse/Stripe/Lever applications found. Listing any 10 apps with applyUrl:");
    const any = await prisma.application.findMany({ include: { job: true }, take: 10, orderBy: { createdAt: "desc" } });
    for (const a of any) console.log(`  ${a.id}  status=${a.status}  url=${a.job?.applyUrl ?? "-"}`);
    return;
  }

  const target = wantId ? apps.find((a) => a.id === wantId) ?? apps[0] : apps[0];
  if (!target) { console.log("no target"); return; }
  console.log(`Target app: ${target.id}  user=${target.userId}  status=${target.status}`);
  console.log(`  role: ${target.roleTitle} @ ${target.company}`);
  console.log(`  applyUrl: ${target.job?.applyUrl}`);

  // Ensure automation consent (testing — user authorized).
  await prisma.userProfile.update({
    where: { userId: target.userId },
    data: { consentToDataProcessing: true },
  }).catch(async () => {
    await prisma.userProfile.create({ data: { userId: target.userId, consentToDataProcessing: true } });
  });

  const token = jwt.sign({ userId: target.userId }, process.env.JWT_SECRET as string, { expiresIn: "1h" });

  console.log("\nCalling /submit (headed browser will open)...\n");
  const res = await fetch(`${BASE}/api/applications/${target.id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const text = await res.text();
  console.log("HTTP", res.status);
  try {
    const json = JSON.parse(text);
    const r = json.result ?? json;
    console.log("status:", r.status, "| code:", r.code);
    console.log("reason:", r.reason);
    console.log("filledFields (", (r.filledFields ?? []).length, "):", JSON.stringify(r.filledFields));
    if (r.coverage) {
      console.log("COVERAGE:", JSON.stringify(r.coverage, null, 2));
    }
  } catch {
    console.log(text.slice(0, 2000));
  }
}

main().catch((e) => console.error(e)).finally(() => prisma.$disconnect());
