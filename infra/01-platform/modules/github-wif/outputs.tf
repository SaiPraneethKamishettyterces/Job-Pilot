output "wif_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Full WIF provider resource name — set as WIF_PROVIDER GitHub Actions variable"
}

output "deploy_sa_email" {
  value       = google_service_account.github_deploy.email
  description = "GitHub deploy service account email — set as WIF_SERVICE_ACCOUNT GitHub Actions variable"
}

output "wif_pool_name" {
  value = google_iam_workload_identity_pool.github.name
}
