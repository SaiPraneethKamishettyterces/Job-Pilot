# ── core ──────────────────────────────────────────────────────────────────────
project_id      = "terces-jobpilot-dev"
billing_account = "0110C2-DC9F09-558D48"
org_id          = "175653229780"
environment     = "dev"
region          = "us-central1"
app_name        = "jobpilot"

# ── access ────────────────────────────────────────────────────────────────────
admin_users = ["skamishetty@terces.io"]

# ── networking ────────────────────────────────────────────────────────────────
vpc_name              = "jobpilot-dev-vpc"
subnet_cidr           = "10.10.0.0/24"
private_ip_range_cidr = "10.20.0.0/16"

# ── database ──────────────────────────────────────────────────────────────────
db_tier = "db-f1-micro"
db_name = "jobpilot"
db_user = "jobpilot"

# ── cloud run ─────────────────────────────────────────────────────────────────
# image is set here after the first push to Artifact Registry, e.g.:
# image = "us-central1-docker.pkg.dev/terces-jobpilot-dev/jobpilot/app:latest"
image                   = ""
cloud_run_min_instances = 0
cloud_run_max_instances = 3
cloud_run_memory        = "512Mi"
cloud_run_cpu           = "1"

# ── github ────────────────────────────────────────────────────────────────────
github_org  = "SaiPraneethKamishettyterces"
github_repo = "Job-Pilot"

# ── feature flags ─────────────────────────────────────────────────────────────
create_networking = true
create_iam        = true
create_secrets    = true
create_database   = true
create_storage    = true
create_cloudrun   = false  # flip to true after first image push
create_github_wif = true
