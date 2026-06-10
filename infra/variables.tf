variable "aws_region" {
  description = "AWS region for the KuroStep EC2 server."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Name prefix for AWS resources."
  type        = string
  default     = "kurostep"
}

variable "instance_type" {
  description = "Smallest practical EC2 instance type for Spring Boot demo."
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key_path" {
  description = "Local path to the SSH public key registered for EC2 access."
  type        = string
  default     = "~/.ssh/kurostep_ec2.pub"
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH into the server. Replace 0.0.0.0/0 with your current IP/32 before production use."
  type        = string
  default     = "0.0.0.0/0"
}

variable "allowed_api_cidr" {
  description = "CIDR allowed to access the Spring Boot API."
  type        = string
  default     = "0.0.0.0/0"
}

