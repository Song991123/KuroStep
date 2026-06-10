# KuroStep

KuroStep is a Spring Boot based creator work companion service.

It connects a creator's daily task card with a work BGM track, playlist, lyric lines, and Korean translation notes. The goal is not to build a simple Todo app or a music app, but to keep the creator's work context in one place.

## Main Features

- Email signup and login
- Spring Security, JWT, and BCrypt authentication
- User-scoped task card CRUD
- Task status changes: `TODO`, `DOING`, `DONE`
- Track registration and search
- Playlist creation and track management
- Task and playlist linking
- LRCLIB-based lyric lookup
- MyMemory-based Korean translation draft
- Line-level translation memo save and lookup
- Minimal Tauri desktop widget
- Swagger/OpenAPI documentation
- Docker, GitHub Actions, and EC2 deployment setup

## Repository Structure

```txt
KuroStep/
  Spring Boot REST API backend

kurostep-tauri-widget/
  Tauri desktop widget and GitHub Pages frontend build

infra/
  Terraform EC2 infrastructure setup

docs/
  Portfolio/report-ready project documentation
```

## Documentation

- [Final Report](docs/report/final-report.md)
- [Project Plan](docs/design/project-plan.md)
- [Data Dictionary](docs/design/data-dictionary.md)
- [Class Diagram](docs/design/class-diagram.md)
- [Progress / WBS](docs/project-management/progress-todo.md)

## Local Backend

```sh
cd KuroStep
./gradlew bootRun
```

## Local Tauri Widget

```sh
cd kurostep-tauri-widget
npm install
npm run dev
```

## Deployment Notes

The frontend can be published through GitHub Pages. The backend is prepared for EC2 deployment with Docker Compose and Terraform, but production use requires AWS credentials, GitHub Secrets, database settings, and HTTPS/CORS configuration.
