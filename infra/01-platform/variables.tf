# ── core ──────────────────────────────────────────────────────────────────────
variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "billing_account" {
  type        = string
  description = "GCP billing account ID"
}

variable "org_id" {
  type        = string
  description = "GCP organization ID"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev / staging / prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod"
  }
}

variable "region" {
  type        = string
  description = "Primary GCP region"
  default     = "us-central1"
}

variable "app_name" {
  type        = string
  description = "Application name prefix for resource naming"
  default     = "jobpilot"
}

# ── access ────────────────────────────────────────────────────────────────────
variable "admin_users" {
  type        = list(string)
  description = "List of admin user emails (e.g. [\"user@example.com\"])"
  default     = []
}

# ── networking ────────────────────────────────────────────────────────────────
variable "vpc_name" {
  type        = string
  description = "VPC network name"
  default     = ""
}

variable "subnet_cidr" {
  type        = string
  description = "Primary subnet CIDR range"
  default     = "10.10.0.0/24"
}

variable "private_ip_range_cidr" {
  type        = string
  description = "Private services IP range for Cloud SQL VPC peering"
  default     = "10.20.0.0/16"
}

# ── database ──────────────────────────────────────────────────────────────────
variable "db_tier" {
  type        = string
  description = "Cloud SQL instance tier"
  default     = "db-f1-micro"
}

variable "db_name" {
  type        = string
  description = "PostgreSQL database name"
  default     = "jobpilot"
}

variable "db_user" {
  type        = string
  description = "PostgreSQL application user"
  default     = "jobpilot"
}

# ── cloud run ─────────────────────────────────────────────────────────────────
variable "image" {
  type        = string
  description = "Docker image URL for the Cloud Run service (set after first image push)"
  default     = ""
}

variable "cloud_run_min_instances" {
  type        = number
  description = "Minimum Cloud Run instances (0 for scale-to-zero)"
  default     = 0
}

variable "cloud_run_max_instances" {
  type        = number
  description = "Maximum Cloud Run instances"
  default     = 3
}

variable "cloud_run_memory" {
  type        = string
  description = "Memory limit per Cloud Run instance"
  default     = "512Mi"
}

variable "cloud_run_cpu" {
  type        = string
  description = "CPU limit per Cloud Run instance"
  default     = "1"
}

# ── github ────────────────────────────────────────────────────────────────────
variable "github_org" {
  type        = string
  description = "GitHub organization or user name"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name"
}

# ── feature flags ─────────────────────────────────────────────────────────────
variable "create_networking" {
  type    = bool
  default = true
}

variable "create_iam" {
  type    = bool
  default = true
}

variable "create_secrets" {
  type    = bool
  default = true
}

variable "create_database" {
  type    = bool
  default = true
}

variable "create_storage" {
  type    = bool
  default = true
}

variable "create_cloudrun" {
  type        = bool
  default     = false
  description = "Set to true after the first Docker image has been pushed to Artifact Registry"
}

variable "create_github_wif" {
  type    = bool
  default = true
}
