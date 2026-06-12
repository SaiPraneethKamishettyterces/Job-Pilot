output "url" {
  value       = google_cloud_run_v2_service.app.uri
  description = "Cloud Run service URL"
}

output "service_name" {
  value = google_cloud_run_v2_service.app.name
}
