output "app_sa_email" {
  value       = google_service_account.app.email
  description = "Cloud Run runtime service account email"
}

output "app_sa_name" {
  value = google_service_account.app.name
}
