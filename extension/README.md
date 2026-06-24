# JobPilot Autofill — browser extension (Autofill V2 · BACKLOG §1.7b)

Fills job-application forms **in your own authenticated browser session**, so it
works on login-gated portals the server-side filler can't reach (Workday, iCIMS,
Taleo, SuccessFactors) as well as the public boards. It reuses the same
`ApplicationPackage` + QA endpoints the server already builds.

## Primary rules (enforced in code)

- **Never auto-submits.** It fills; *you* review and click the site's Submit.
- **Never stores portal credentials; never automates portal login.** You're
  already logged into Workday/iCIMS in your tab — the extension just fills the DOM.
- **Never fills EEO/demographic fields** and **never fabricates** sensitive
  answers — those are surfaced in the popup for you to handle.
- **Hard stops** on CAPTCHA / login / account-creation / OTP (surfaced, not bypassed).

## Build & load

```bash
npm install                      # once (adds @crxjs/vite-plugin + @types/chrome)
npm run typecheck:extension      # type-safety check
npm run build:extension          # → extension-dist/
```

Then in Chrome/Edge: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select the `extension-dist/` folder.

Dev with HMR: `npx vite --config vite.extension.config.ts`.

## Use

1. In JobPilot, generate documents for an application (creates its package). Copy
   the **Application ID** and an **access token** (a JWT for your account).
2. Open the job's application page (log into Workday/iCIMS yourself if prompted).
3. Click the JobPilot toolbar icon → set the API URL + token in **Settings** once →
   paste the Application ID → **Fill this application**.
4. Review the form (especially items the popup flags for review), then click the
   **site's** Submit button. Back in the popup, hit **mark applied**.

## Architecture

```
src/content/main.ts        orchestrator (in-page): fetch package → pick adapter → fill → report
src/lib/dom-engine.ts      DOM port of the server resolution ladder (label fill → QA → re-loop)
src/lib/adapters/workday.ts multi-step wizard: fill step → advance → STOP before Submit
src/lib/api.ts             JobPilot API client (package, answers, mark-applied)
src/popup/                 vanilla-TS popup: trigger fill, show report + review items
src/background/main.ts     thin MV3 service worker
```

Shared with the server (one source of truth): `shared/autofill/adapter.ts`
(detection + capabilities) and `shared/autofill/package-types.ts` (wire contract).

## Per-portal verification checklist

Run **2–3 real applications per portal**. A portal is "supported" only when all
pass. Login-gated portals require *your* authenticated session — they cannot be
verified in CI.

For each application:

- [ ] **Greenhouse is the baseline** — confirm the extension matches the
      server-side filler's ~100% fill on Greenhouse first.
- [ ] 100% of fillable standard fields populated (name, contact, links, work, edu).
- [ ] No fabricated answers; low-confidence + sensitive + EEO items appear under
      "Review these" in the popup (NOT silently filled).
- [ ] No credentials requested/stored; no auto-login; **nothing auto-submitted**.
- [ ] Resume attached, or a clear manual-attach prompt for custom uploaders.
- [ ] Required-blank list in the popup is empty (only Submit remains).
- [ ] Workday only: advances through all steps and **stops on the review/Submit
      page** without clicking Submit.

Portals: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Breezy,
Teamtailor, Jobvite, Workday, iCIMS, Taleo, SuccessFactors.

## Known follow-ups (not blockers)

- Auto-associate the current tab's URL with its JobPilot application (drop the
  manual Application-ID paste).
- Dedicated extension-auth handshake endpoint (replace the pasted token).
- Resume auto-attach via `DataTransfer` from the package `downloadUrl`.
- react-select / combobox handling parity with the server `fillCombobox`.
- Per-tenant selector tuning for SmartRecruiters/Recruitee/Breezy/Teamtailor/Jobvite
  (the Phase-A maps are best-effort pending live verification).
