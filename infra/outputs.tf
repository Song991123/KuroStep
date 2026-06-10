output "public_ip" {
  description = "Elastic public IP of the KuroStep API server."
  value       = aws_eip.kurostep.public_ip
}

output "api_base_url" {
  description = "Temporary HTTP API base URL before HTTPS/domain setup."
  value       = "http://${aws_eip.kurostep.public_ip}:8080"
}

output "ssh_command" {
  description = "SSH command for server access."
  value       = "ssh ubuntu@${aws_eip.kurostep.public_ip}"
}

