resource "google_storage_bucket" "resumes" {
  project                     = var.project_id
  name                        = "${var.project_id}-resumes"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.environment != "prod"

  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 365 }
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = var.labels
}
