# KuroStep Session Roles

## 문서 목적

KuroStep 프로젝트를 여러 Codex 세션으로 나누어 진행할 때 각 세션의 역할, 시작 프롬프트, 갱신할 문서를 정리한다.

한 세션에서 모든 일을 처리하면 구현, 일정, 학습 내용이 섞이므로 아래처럼 분리한다.

## 1. 총괄 세션

현재 이 채팅의 역할이다.

### 역할

- 프로젝트 방향 유지
- 범위 조절
- 우선순위 판단
- 구현 중 막힌 부분 의사결정
- 문서와 실제 코드 불일치 점검
- 다른 세션에서 나온 결과 정리

### 시작 프롬프트

```text
이 채팅은 KuroStep 프로젝트 총괄 세션이야.

나는 Spring Boot 백엔드 세미 프로젝트로 KuroStep을 2026년 6월 10일 저녁 보고를 목표로 구현 중이야.
이 세션에서는 전체 방향, 범위 조절, 우선순위, 구현 판단, 문서와 코드 불일치 점검을 맡아줘.

다른 세션에서 일정 관리와 Spring Boot 학습을 따로 진행할 예정이므로, 여기서는 너무 세부 강의로 빠지지 말고 현재 구현 상태와 마감 가능성을 기준으로 판단해줘.

반드시 먼저 아래 문서를 읽고 현재 맥락을 파악해줘.
- 02_백엔드세미용/AGENTS.md
- 02_백엔드세미용/KuroStep_Codex_Session_Rules.md
- 02_백엔드세미용/KuroStep_Session_Roles.md
- 02_백엔드세미용/KuroStep_Backend_Semi_Project_Plan.md
- 02_백엔드세미용/KuroStep_Data_Dictionary.md
- 02_백엔드세미용/KuroStep_Class_Diagram.md

답변은 지금 당장 해야 할 판단과 다음 행동 중심으로 해줘.
```

### 갱신할 문서

- `KuroStep_Codex_Session_Rules.md`
- `KuroStep_Backend_Semi_Project_Plan.md`
- `KuroStep_Backend_Semi_Final_Template.md`
- `KuroStep_Session_Roles.md`

## 2. 일정/Todo 관리 세션

구현 일정, 오늘 할 일, 마감까지 남은 작업을 관리하는 세션이다.

### 역할

- 날짜 기준 일정 관리
- 오늘 할 일 쪼개기
- 완료/미완료 체크
- 마감까지 남은 기능 컷라인 조정
- 보고 가능한 MVP 기준 유지
- 사용자가 지쳤을 때 최소 다음 행동만 제시

### 시작 프롬프트

```text
이 채팅은 KuroStep 일정/Todo 관리 세션이야.

현재 날짜는 2026년 6월 8일이고, 목표는 2026년 6월 10일 저녁까지 보고 가능한 Spring Boot 백엔드 세미 프로젝트 MVP를 만드는 거야.

너는 구현을 직접 하기보다, 내가 오늘 무엇을 해야 하는지 순서대로 관리해줘.
완료한 일, 남은 일, 오늘 반드시 끝낼 일, 내일로 넘겨도 되는 일을 나눠줘.
내가 지치거나 밀리면 범위를 줄여서라도 보고 가능한 상태로 데려가줘.

반드시 먼저 아래 문서를 읽어줘.
- 02_백엔드세미용/AGENTS.md
- 02_백엔드세미용/KuroStep_Codex_Session_Rules.md
- 02_백엔드세미용/KuroStep_Session_Roles.md
- 02_백엔드세미용/KuroStep_Sunday_Todo.md
- 02_백엔드세미용/KuroStep_Backend_Semi_Project_Plan.md

이 세션에서 갱신할 문서는 아래 하나로 제한해줘.
- 02_백엔드세미용/KuroStep_Progress_Todo.md

항상 답변 마지막에는 “지금 당장 할 1개 작업”을 적어줘.
```

### 갱신할 문서

- `KuroStep_Progress_Todo.md`

### 문서 운영 방식

`KuroStep_Progress_Todo.md`에는 아래 항목을 유지한다.

```text
# KuroStep Progress Todo

## 현재 날짜

## 마감

## 오늘 반드시 할 일

## 오늘 하면 좋은 일

## 완료

## 막힘

## 내일로 넘길 일

## 보고용 최소 컷라인
```

## 3. Spring Boot 학습 세션

Spring Boot MVC, JPA, Security, 현재 코드 구조를 학습하는 세션이다.

### 역할

- MVC 흐름 설명
- 현재 코드 한 파일씩 해설
- Controller / Service / Repository / Entity / DTO 역할 설명
- JPA 연관관계 설명
- Optional, Transaction, Validation 같은 Java/Spring 개념 설명
- 사용자가 모르는 개념을 학습 노트로 정리

### 시작 프롬프트

```text
이 채팅은 KuroStep Spring Boot 학습 세션이야.

나는 Spring Boot 초보이고, KuroStep 프로젝트를 구현하면서 MVC, JPA, Repository, Service, Controller, DTO, Entity, Optional, 예외 처리, Security/JWT를 같이 배우고 싶어.

이 세션에서는 구현을 대신 많이 진행하지 말고, 현재 코드가 왜 이렇게 되어 있는지 한 파일씩 뜯어서 설명해줘.
설명은 너무 추상적으로 하지 말고, KuroStep 실제 코드 기준으로 해줘.

반드시 먼저 아래 문서를 읽어줘.
- 02_백엔드세미용/AGENTS.md
- 02_백엔드세미용/KuroStep_Codex_Session_Rules.md
- 02_백엔드세미용/KuroStep_Session_Roles.md
- 02_백엔드세미용/KuroStep_Class_Diagram.md
- 02_백엔드세미용/KuroStep_Data_Dictionary.md
- 02_백엔드세미용/KuroStep_Naming_Guide.md

그리고 현재 코드는 아래 순서로 설명해줘.
1. Entity
2. Repository
3. DTO
4. Controller
5. Service TODO
6. 예외 처리
7. Security/JWT

이 세션에서 갱신할 문서는 아래 하나로 제한해줘.
- 02_백엔드세미용/KuroStep_Learning_Notes.md

내가 모르는 개념이 나오면 설명 후 학습 노트에 짧게 정리해줘.
```

### 갱신할 문서

- `KuroStep_Learning_Notes.md`

### 문서 운영 방식

`KuroStep_Learning_Notes.md`에는 아래 항목을 유지한다.

```text
# KuroStep Learning Notes

## MVC 흐름

## Entity

## Repository

## DTO

## Controller

## Service

## JPA 개념

## Java 개념

## Security/JWT

## 헷갈렸던 질문과 답
```

## 4. 구현 세션

실제 코드를 빠르게 작성하고 컴파일, 실행, API 테스트를 진행하는 세션이다.

### 역할

- TODO 메서드 구현
- 컴파일 오류 수정
- 실행 오류 수정
- API 테스트
- 필요한 최소 예외 처리 추가
- Swagger/Docker/Tauri 작업

### 시작 프롬프트

```text
이 채팅은 KuroStep 구현 세션이야.

목표는 2026년 6월 10일 저녁까지 보고 가능한 MVP를 완성하는 것이다.
너는 코드 구현, 컴파일 오류 수정, 실행 오류 수정, API 테스트를 담당해줘.

지금 프로젝트에는 Entity, Repository, DTO, Controller 틀이 있고 Service 메서드에 TODO와 UnsupportedOperationException이 남아 있다.
우선순위는 Service TODO 구현이다.

반드시 먼저 아래 문서를 읽어줘.
- 02_백엔드세미용/AGENTS.md
- 02_백엔드세미용/KuroStep_Codex_Session_Rules.md
- 02_백엔드세미용/KuroStep_Session_Roles.md
- 02_백엔드세미용/KuroStep_Data_Dictionary.md
- 02_백엔드세미용/KuroStep_Class_Diagram.md

구현 순서는 아래를 따른다.
1. 공통 예외 처리 최소 틀
2. TrackService
3. PlaylistService
4. CreatorTaskService
5. API 실행 확인
6. 회원가입/로그인/JWT
7. Swagger
8. Tauri 최소 클라이언트

코드 수정 전에는 어떤 파일을 왜 수정하는지 짧게 말해줘.
하나 구현할 때마다 compile 또는 실행으로 확인해줘.
```

### 갱신할 문서

- 구현 세션은 기본적으로 코드를 갱신한다.
- 진행 기록이 필요하면 `KuroStep_Progress_Todo.md`에 완료 항목만 짧게 추가한다.

## 세션 간 규칙

- 총괄 세션은 방향과 판단을 담당한다.
- 일정/Todo 세션은 마감과 우선순위를 담당한다.
- 학습 세션은 개념 이해를 담당한다.
- 구현 세션은 실제 코드를 담당한다.
- 같은 내용을 여러 문서에 중복 갱신하지 않는다.
- 보고서 최종 문서는 반드시 `KuroStep_Backend_Semi_Final_Template.md`를 기준으로 한다.
