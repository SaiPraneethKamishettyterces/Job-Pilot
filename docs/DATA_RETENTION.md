# Data Retention & Privacy Policy (operational)

This is the **operational** retention policy for JobPilot — what data we store,
why, how long, and how a user exercises their rights. It documents behavior that
is already enforced in code; it is not legal advice and should be reviewed by
counsel before public launch.

## What we store

| Category | Where | Purpose |
|---|---|---|
| Account (email, name, password hash, email-verification state) | Postgres `User` | Authentication |
| Profile & preferences | Postgres `UserProfile`, `UserPreferences` | Matching, document tailoring, autofill |
| Resumes (extracted text + parsed JSON; the original upload is **not** retained) | Postgres `Resume` | Resume tailoring |
| Generated documents (tailored resume bytes, packages) | Postgres `Artifact` | Application preparation |
| Jobs, applications, answers, events | Postgres `Job`, `Application`, … | The core product |
| AI usage / cost events | Postgres `AIUsageEvent` | Billing, usage limits |
| Subscription & billing events | Postgres `Subscription`, `SubscriptionEvent` | Billing |
| Audit log of sensitive account ops | Postgres `AuditLog` | Compliance / security |

Note: uploaded resume **files** are deleted from disk immediately after text
extraction (`server/routes/resumes.ts`); only the extracted text is persisted.
No data is stored in any external object store — Postgres is the single store.

## Retention periods

- **Active accounts:** data is retained for the life of the account.
- **On account deletion:** all user data is permanently deleted immediately via
  a cascading delete (`DELETE /api/account`). This includes profile, resumes,
  generated artifacts, applications, answers, usage and subscription events.
- **Audit log:** `AuditLog` rows are **retained after deletion** (the `userId`
  column has no foreign key on purpose) so a defensible record of the
  export/deletion exists. Recommended retention: **24 months**, then purge.
- **Backups:** database backups follow the hosting provider's backup schedule;
  deleted data ages out of backups per that schedule (document the provider
  value here once chosen).

## User rights (implemented)

- **Right to access / portability:** `GET /api/account/export` returns a single
  JSON document with all of the user's data (password hash redacted). Each
  export is recorded in `AuditLog` (`action = "account.export"`).
- **Right to erasure:** `DELETE /api/account` permanently deletes the account
  and all related data. The deletion is recorded in `AuditLog`
  (`action = "account.delete"`) before the cascade runs.

## Consent

Form-fill/submit automation requires explicit `consentToDataProcessing`
(captured on the profile). The submit endpoint refuses to act without it.

## Open items before public launch

- Confirm backup retention window with the hosting provider and fill it in above.
- Legal review of this policy and a user-facing privacy notice.
- Decide on an automated `AuditLog` purge job at the chosen retention age.
