locals {
  name_prefix = "${var.app_name}-${var.environment}"
  default_labels = {
    app         = var.app_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# ── API enablement ────────────────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sql-component.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "sts.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ── Org policy: allow all members (required for allUsers Cloud Run invoker) ───
resource "google_org_policy_policy" "allow_all_members" {
  name   = "projects/${var.project_id}/policies/iam.allowedPolicyMemberDomains"
  parent = "projects/${var.project_id}"

  spec {
    rules {
      allow_all = "TRUE"
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Artifact Registry ────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = var.app_name
  format        = "DOCKER"
  description   = "${var.app_name} Docker images"
  labels        = local.default_labels

  depends_on = [google_project_service.apis]
}

# ── default Compute SA roles (Cloud Run runtime) ─────────────────────────────
data "google_project" "project" {
  project_id = var.project_id
}

resource "google_project_iam_member" "compute_sa_roles" {
  for_each = toset([
    "roles/secretmanager.secretAccessor",
    "roles/cloudsql.client",
    "roles/storage.objectAdmin",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"

  depends_on = [google_project_service.apis]
}

# ── modules ───────────────────────────────────────────────────────────────────
module "networking" {
  source = "./modules/networking"
  count  = var.create_networking ? 1 : 0

  project_id            = var.project_id
  region                = var.region
  vpc_name              = coalesce(var.vpc_name, "${local.name_prefix}-vpc")
  subnet_cidr           = var.subnet_cidr
  private_ip_range_cidr = var.private_ip_range_cidr
  labels                = local.default_labels

  depends_on = [google_project_service.apis]
}

module "iam" {
  source = "./modules/iam"
  count  = var.create_iam ? 1 : 0

  project_id   = var.project_id
  environment  = var.environment
  app_name     = var.app_name
  admin_users  = var.admin_users

  depends_on = [google_project_service.apis]
}

module "secrets" {
  source = "./modules/secrets"
  # requires create_database=true so module.database[0] is guaranteed to exist
  count  = var.create_secrets && var.create_database ? 1 : 0

  project_id          = var.project_id
  app_name            = var.app_name
  app_sa_email        = coalesce(one(module.iam[*].app_sa_email), "${data.google_project.project.number}-compute@developer.gserviceaccount.com")
  cloud_sql_conn_name = module.database[0].connection_name
  db_name             = var.db_name
  db_user             = var.db_user
  db_password         = module.database[0].db_password
  labels              = local.default_labels

  depends_on = [
    google_project_service.apis,
    module.database,
  ]
}

module "database" {
  source = "./modules/database"
  count  = var.create_database ? 1 : 0

  project_id     = var.project_id
  region         = var.region
  environment    = var.environment
  app_name       = var.app_name
  db_tier        = var.db_tier
  db_name        = var.db_name
  db_user        = var.db_user
  vpc_network_id = var.create_networking ? module.networking[0].vpc_id : ""
  labels         = local.default_labels

  depends_on = [
    google_project_service.apis,
    module.networking,
  ]
}

module "storage" {
  source = "./modules/storage"
  count  = var.create_storage ? 1 : 0

  project_id  = var.project_id
  region      = var.region
  app_name    = var.app_name
  environment = var.environment
  labels      = local.default_labels

  depends_on = [google_project_service.apis]
}

module "cloudrun" {
  source = "./modules/cloudrun"
  count  = var.create_cloudrun && var.image != "" ? 1 : 0

  project_id          = var.project_id
  region              = var.region
  environment         = var.environment
  app_name            = var.app_name
  image               = var.image
  min_instances       = var.cloud_run_min_instances
  max_instances       = var.cloud_run_max_instances
  memory              = var.cloud_run_memory
  cpu                 = var.cloud_run_cpu
  app_sa_email        = coalesce(one(module.iam[*].app_sa_email), "${data.google_project.project.number}-compute@developer.gserviceaccount.com")
  cloud_sql_conn_name = coalesce(one(module.database[*].connection_name), "")
  vpc_network_id      = coalesce(one(module.networking[*].vpc_id), "")
  vpc_subnet_id       = coalesce(one(module.networking[*].subnet_id), "")
  resumes_bucket_name = coalesce(one(module.storage[*].resumes_bucket_name), "")
  labels              = local.default_labels

  depends_on = [
    google_org_policy_policy.allow_all_members,
    module.networking,
    module.iam,
    module.database,
    module.storage,
    module.secrets,
  ]
}

module "github_wif" {
  source = "./modules/github-wif"
  count  = var.create_github_wif ? 1 : 0

  project_id   = var.project_id
  project_number = data.google_project.project.number
  environment  = var.environment
  github_org   = var.github_org
  github_repo  = var.github_repo

  depends_on = [google_project_service.apis]
}
