output "connection_name" {
  value       = google_sql_database_instance.main.connection_name
  description = "Cloud SQL connection name (project:region:instance)"
}

output "private_ip" {
  value       = google_sql_database_instance.main.private_ip_address
  description = "Private IP address of the Cloud SQL instance"
}

output "instance_name" {
  value = google_sql_database_instance.main.name
}

output "db_password" {
  value     = random_password.db.result
  sensitive = true
}
