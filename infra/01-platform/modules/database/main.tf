resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "main" {
  project          = var.project_id
  region           = var.region
  name             = "${var.app_name}-db-${var.environment}"
  database_version = "POSTGRES_16"

  settings {
    tier = var.db_tier

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.vpc_network_id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled    = var.environment == "prod"
      start_time = "02:00"
    }

    database_flags {
      name  = "max_connections"
      value = var.environment == "prod" ? "100" : "50"
    }
  }

  deletion_protection = var.environment == "prod"

  user_labels = var.labels
}

resource "google_sql_database" "app" {
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  name     = var.db_name
}

resource "google_sql_user" "app" {
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  name     = var.db_user
  password = random_password.db.result
}
