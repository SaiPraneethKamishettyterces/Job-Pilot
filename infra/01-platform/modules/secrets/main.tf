resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

# ── Secret: DATABASE_URL ──────────────────────────────────────────────────────
resource "google_secret_manager_secret" "database_url" {
  project   = var.project_id
  secret_id = "${var.app_name}-database-url"
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  # PostgreSQL socket URL for Cloud SQL: host=/cloudsql/<connection_name>
  secret_data = "postgresql://${var.db_user}:${var.db_password}@/${var.db_name}?host=/cloudsql/${var.cloud_sql_conn_name}"
}

resource "google_secret_manager_secret_iam_member" "database_url_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.app_sa_email}"
}

# ── Secret: JWT_SECRET ────────────────────────────────────────────────────────
resource "google_secret_manager_secret" "jwt_secret" {
  project   = var.project_id
  secret_id = "${var.app_name}-jwt-secret"
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

resource "google_secret_manager_secret_iam_member" "jwt_secret_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.jwt_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.app_sa_email}"
}

# ── Secret: ANTHROPIC_API_KEY (placeholder — fill via gcloud) ─────────────────
resource "google_secret_manager_secret" "anthropic_api_key" {
  project   = var.project_id
  secret_id = "${var.app_name}-anthropic-api-key"
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "anthropic_api_key_placeholder" {
  secret      = google_secret_manager_secret.anthropic_api_key.id
  secret_data = "REPLACE_ME"

  lifecycle {
    # Prevent Terraform from overwriting a real key set via gcloud
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "anthropic_api_key_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.anthropic_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.app_sa_email}"
}
