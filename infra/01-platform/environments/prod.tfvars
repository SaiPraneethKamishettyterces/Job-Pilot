# ── core ──────────────────────────────────────────────────────────────────────
project_id      = "terces-jobpilot-prod"
billing_account = "0110C2-DC9F09-558D48"
org_id          = "175653229780"
environment     = "prod"
region          = "us-central1"
app_name        = "jobpilot"

# ── access ────────────────────────────────────────────────────────────────────
admin_users = ["skamishetty@terces.io"]

# ── networking ────────────────────────────────────────────────────────────────
vpc_name              = "jobpilot-prod-vpc"
subnet_cidr           = "10.30.0.0/24"
private_ip_range_cidr = "10.40.0.0/16"

# ── database ──────────────────────────────────────────────────────────────────
db_tier = "db-n1-standard-2"
db_name = "jobpilot"
db_user = "jobpilot"

# ── cloud run ─────────────────────────────────────────────────────────────────
image                   = ""
cloud_run_min_instances = 1
cloud_run_max_instances = 10
cloud_run_memory        = "1Gi"
cloud_run_cpu           = "2"

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
