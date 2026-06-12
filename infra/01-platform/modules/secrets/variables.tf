variable "project_id" { type = string }
variable "app_name" { type = string }
variable "app_sa_email" { type = string }
variable "cloud_sql_conn_name" { type = string }
variable "db_name" { type = string }
variable "db_user" { type = string }

variable "db_password" {
  type      = string
  sensitive = true
}

variable "labels" { type = map(string) }
