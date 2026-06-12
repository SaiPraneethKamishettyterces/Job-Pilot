output "database_url_secret_id" {
  value = google_secret_manager_secret.database_url.secret_id
}

output "jwt_secret_id" {
  value = google_secret_manager_secret.jwt_secret.secret_id
}

output "anthropic_api_key_secret_id" {
  value = google_secret_manager_secret.anthropic_api_key.secret_id
}
