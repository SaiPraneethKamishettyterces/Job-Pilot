locals {
  env = var.environment
}

# ── Application runtime SA ───────────────────────────────────────────────────
resource "google_service_account" "app" {
  project      = var.project_id
  account_id   = "sa-${var.app_name}-app-${local.env}"
  display_name = "${var.app_name} Cloud Run runtime (${local.env})"
}

resource "google_project_iam_member" "app_sa_roles" {
  for_each = toset([
    "roles/secretmanager.secretAccessor",
    "roles/cloudsql.client",
    "roles/storage.objectAdmin",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/run.invoker",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app.email}"
}

# ── Admin user roles ──────────────────────────────────────────────────────────
resource "google_project_iam_member" "admin_roles" {
  for_each = toset(flatten([
    for user in var.admin_users : [
      "user:${user}",
    ]
  ]))

  project = var.project_id
  role    = "roles/editor"
  member  = each.value
}

resource "google_project_iam_member" "admin_secret_access" {
  for_each = toset([for u in var.admin_users : "user:${u}"])

  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = each.value
}
