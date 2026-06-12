output "project_id" {
  value = var.project_id
}

output "project_number" {
  value = data.google_project.project.number
}

output "artifact_registry_repo" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.app_name}"
  description = "Artifact Registry base URL for Docker images"
}

output "cloud_sql_connection_name" {
  value       = one(module.database[*].connection_name)
  description = "Cloud SQL connection name — use in DATABASE_URL socket path"
}

output "cloud_sql_private_ip" {
  value       = one(module.database[*].private_ip)
  description = "Cloud SQL private IP address"
}

output "resumes_bucket_name" {
  value       = one(module.storage[*].resumes_bucket_name)
  description = "GCS bucket name for resume uploads (set as GCS_BUCKET_NAME env var)"
}

output "cloud_run_url" {
  value       = one(module.cloudrun[*].url)
  description = "Cloud Run service URL"
}

output "app_sa_email" {
  value       = one(module.iam[*].app_sa_email)
  description = "Cloud Run runtime service account email"
}

output "wif_provider" {
  value       = one(module.github_wif[*].wif_provider)
  description = "Workload Identity Provider resource name — set as WIF_PROVIDER GitHub variable"
}

output "github_deploy_sa" {
  value       = one(module.github_wif[*].deploy_sa_email)
  description = "GitHub deploy service account — set as WIF_SERVICE_ACCOUNT GitHub variable"
}

output "vpc_network" {
  value       = one(module.networking[*].vpc_id)
  description = "VPC network self link"
}

output "vpc_subnet" {
  value       = one(module.networking[*].subnet_id)
  description = "VPC subnet self link"
}
