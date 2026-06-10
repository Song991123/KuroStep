# KuroStep AWS EC2 Terraform

이 폴더는 KuroStep 백엔드 서버를 AWS EC2에 코드로 만들기 위한 Terraform 설정이다.

## 생성되는 리소스

- Ubuntu 22.04 EC2 1대
- 보안그룹
- SSH Key Pair
- Elastic IP
- Docker / Docker Compose 설치용 user-data

## 1. SSH 키 생성

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kurostep_ec2 -C "kurostep-ec2"
```

## 2. AWS 인증 설정

AWS 콘솔에서 액세스 키를 만들고 로컬에 설정한다.

```bash
aws configure
```

## 3. Terraform 실행

```bash
cd infra
terraform init
terraform plan
terraform apply
```

## 4. GitHub Secrets

GitHub 저장소 `Settings > Secrets and variables > Actions`에 아래 값을 등록한다.

| Secret | 의미 |
|---|---|
| `EC2_HOST` | Terraform output의 `public_ip` |
| `EC2_USER` | Ubuntu AMI 기본 사용자. 보통 `ubuntu` |
| `EC2_SSH_KEY` | `~/.ssh/kurostep_ec2` 개인키 내용 |
| `MYSQL_PASSWORD` | 운영 MySQL 사용자 비밀번호 |
| `MYSQL_ROOT_PASSWORD` | 운영 MySQL root 비밀번호 |
| `KUROSTEP_JWT_SECRET` | JWT 서명용 긴 랜덤 문자열 |

## 5. 임시 접속 URL

HTTPS/domain 설정 전에는 아래 형태로 테스트한다.

```text
http://EC2_PUBLIC_IP:8080
```

GitHub Pages에서 직접 호출하려면 HTTPS가 필요하므로, 발표 후속 작업으로 도메인 + Nginx + Let's Encrypt를 붙인다.

