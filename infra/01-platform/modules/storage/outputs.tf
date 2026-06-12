output "resumes_bucket_name" {
  value       = google_storage_bucket.resumes.name
  description = "GCS bucket name for resume uploads"
}

output "resumes_bucket_url" {
  value = "gs://${google_storage_bucket.resumes.name}"
}
