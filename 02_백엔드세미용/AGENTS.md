# KuroStep Backend Seminar Rules

These rules apply only to the KuroStep backend seminar planning and implementation work in this folder.

## Role

Codex should act as the user's personal development assistant for this solo Spring Boot backend seminar project.

Keep the KuroStep context in mind, help control scope, and support planning, implementation, debugging, documentation, and presentation prep.

## Project

KuroStep is a creator-focused work companion service with a black cat concept.

The product metaphor is a quiet black cat walking beside the user's desk work step by step. The black cat theme should feel like a signature identity, not a fantasy game concept.

The core idea is to connect:

- creator task card
- work BGM track
- lyric lines
- Korean translation memo

into one work context.

It is not just a Todo app and not just a music app.

## Main Stack

- Java
- Spring Boot
- Spring MVC
- Spring Data JPA
- Spring Security
- JWT
- BCrypt
- MySQL / H2
- Swagger / springdoc-openapi
- Tauri
- Docker
- AWS EC2

## Client And API Positioning

- Tauri is the Mac client used to show the main user-facing experience.
- Spring Boot is the REST API backend.
- Swagger is for API documentation and development verification, not the main UI.

## Five-Day MVP

Must implement:

- signup
- login
- Spring Security + JWT
- BCrypt password encoding
- user-specific authorization checks
- creator task CRUD
- task status changes: `TODO`, `DOING`, `DONE`
- track create/search
- external official-player based music playback
- playlist create/update/delete
- add/reorder/remove tracks in a playlist
- connect a task with a playlist
- set the current playlist track for a task
- LRCLIB Provider based automatic lyric lookup
- local lyric file storage in the user's Tauri app data directory
- Korean auto-translation draft
- Korean translation memo create/update
- minimal Tauri client and always-on-top overlay integration
- Swagger API docs
- today task aggregate API
- Docker run
- AWS EC2 deployment

Optional if time remains:

- more tests
- WebSocket status delivery
- Tauri overlay styling polish
- MySQL profile separation

Out of scope for this seminar:

- audio download/extraction/server-side audio storage
- server-side central database collection of full lyric text
- YouTube video/audio download
- high-volume YouTube caption collection
- advanced overlay features such as multi-monitor polish, click-through, and global shortcuts
- work time statistics
- collaboration features
- mobile app

## Implementation Priorities

1. Auth and user model first.
2. Task CRUD next.
3. Track, playlist, and task-playlist connection next.
4. Current playlist track, LRCLIB lyrics, local lyric file cache, and translation memo next.
5. Tauri client after core APIs work.
6. Swagger, tests, Docker, and deployment cleanup last.

## Presentation Emphasis

Emphasize:

- work context management
- user-specific authorization
- JPA relationships
- Spring Security + JWT
- Tauri client connected to a Spring Boot API

Avoid expanding scope unless the user explicitly asks.

## Troubleshooting Log Rule

When implementation or verification reveals a meaningful issue, record it in the report troubleshooting section.

Include backend issues as well as Tauri/client integration issues. For each item, keep:

- symptom
- likely cause
- attempted fix or final handling
- remaining limitation if any

## Required Report Format

Final planning and report documents must follow the instructor's `Personal Project` format exactly. Do not add separate brand, concept, roadmap, or extra top-level sections outside this structure.

Required top-level sections:

1. 프로젝트 개요
2. 요구사항 분석
3. 기술 스택
4. 시스템 아키텍처
5. 데이터베이스 설계
6. API 설계
7. 프로젝트 구조
8. 회원 인증 및 인가
9. 핵심 비즈니스 기능 구현
10. JPA 활용
11. 테스트
12. API 문서화
13. Docker 적용
14. 배포
15. 트러블슈팅
16. 프로젝트 회고

Keep `Personal_Project_Report_Template.md` as the source template for this format.
