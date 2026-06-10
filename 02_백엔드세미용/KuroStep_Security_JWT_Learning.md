# KuroStep Security / JWT Learning Notes

## 문서 목적

이 문서는 KuroStep에서 Spring Security와 JWT가 어떤 느낌으로 동작하는지 차근차근 이해하기 위한 학습 노트이다.

현재 KuroStep에는 아래 코드가 이미 있다.

- `SecurityConfig`
- `PasswordEncoder`
- `AuthService.signup`
- `AuthService.login`
- `SignupRequest`
- `LoginRequest`
- `AuthResponse`

JWT 발급과 JWT 인증 필터는 아직 TODO 상태이다.

## 보안이 필요한 이유

KuroStep에는 사용자별 데이터가 있다.

- 내 작업 카드
- 내 플레이리스트
- 내 번역 메모
- 내 로컬 가사 캐시 상태

그래서 서버는 두 가지를 확인해야 한다.

```text
1. 이 요청을 보낸 사람이 로그인한 사용자인가?
2. 로그인한 사용자가 이 데이터의 주인인가?
```

1번은 Spring Security/JWT가 주로 담당한다.

2번은 Service 계층에서 직접 검증한다.

예를 들어 `CreatorTaskService`에는 아래 같은 코드가 있다.

```java
if (!task.getUser().getId().equals(userId)) {
    throw new ForbiddenException("작업 카드 접근 권한이 없습니다.");
}
```

이건 로그인은 했더라도 남의 작업 카드에 접근하면 막는 코드이다.

## 현재 SecurityConfig 상태

현재 파일:

`KuroStep/src/main/java/com/kurostep/security/config/SecurityConfig.java`

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    return http
            .csrf(csrf -> csrf.disable())
            .headers(headers -> headers.frameOptions(frameOptions -> frameOptions.sameOrigin()))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .build();
}
```

현재 의미:

```text
모든 요청을 허용한다.
```

아직 개발 초기라서 Swagger, H2 console, API 테스트를 쉽게 하기 위한 상태이다.

JWT 적용 후 목표는 아래처럼 바뀐다.

```text
회원가입, 로그인, Swagger, H2 console은 허용
나머지 API는 로그인한 사용자만 허용
```

예상 형태:

```java
.authorizeHttpRequests(auth -> auth
        .requestMatchers("/api/auth/signup", "/api/auth/login").permitAll()
        .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
        .requestMatchers("/h2-console/**").permitAll()
        .anyRequest().authenticated()
)
```

## PasswordEncoder

현재 `SecurityConfig`에는 아래 Bean이 있다.

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
}
```

이 뜻은 Spring이 `PasswordEncoder` 객체를 하나 만들어두고, 필요한 곳에 주입해준다는 뜻이다.

`AuthService`는 이걸 생성자로 받는다.

```java
private final PasswordEncoder passwordEncoder;

public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
}
```

회원가입 때는 원문 비밀번호를 그대로 DB에 저장하지 않는다.

```java
passwordEncoder.encode(request.password())
```

로그인 때는 사용자가 입력한 원문 비밀번호와 DB에 저장된 암호화 비밀번호를 비교한다.

```java
passwordEncoder.matches(request.password(), user.getPassword())
```

중요:

```text
DB에는 "1234"가 저장되지 않는다.
BCrypt로 암호화된 긴 문자열이 저장된다.
```

## 현재 회원가입 흐름

현재 `AuthService.signup` 흐름:

```text
1. 이메일 중복 확인
2. 중복이면 ConflictException
3. 비밀번호 BCrypt 암호화
4. User Entity 생성
5. UserRepository.save(user)
6. AuthResponse 반환
```

코드:

```java
if (userRepository.existsByEmail(request.email())) {
    throw new ConflictException("이미 사용 중인 이메일입니다.");
}

User user = User.create(
        request.email(),
        passwordEncoder.encode(request.password()),
        request.nickname()
);

return AuthResponse.from(userRepository.save(user));
```

## 현재 로그인 흐름

현재 `AuthService.login` 흐름:

```text
1. 이메일로 사용자 조회
2. 없으면 로그인 실패 예외
3. 입력 비밀번호와 저장된 암호화 비밀번호 비교
4. 틀리면 로그인 실패 예외
5. 현재는 AuthResponse 반환
6. JWT 구현 후에는 accessToken도 반환해야 함
```

코드:

```java
User user = userRepository.findByEmail(request.email())
        .orElseThrow(() -> new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다."));

if (!passwordEncoder.matches(request.password(), user.getPassword())) {
    throw new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다.");
}

return AuthResponse.from(user);
```

보통 로그인 실패 메시지는 이메일이 틀렸는지, 비밀번호가 틀렸는지 자세히 말하지 않는다.

이유:

```text
공격자가 어떤 이메일이 가입되어 있는지 추측하기 어려워야 하기 때문이다.
```

## JWT는 무엇인가

JWT는 로그인 성공 후 서버가 클라이언트에게 발급하는 토큰이다.

로그인 전:

```text
서버는 이 요청이 누구의 요청인지 모른다.
```

로그인 성공 후:

```text
서버가 accessToken을 발급한다.
클라이언트는 이후 요청마다 Authorization 헤더에 토큰을 붙인다.
서버는 토큰을 보고 사용자를 식별한다.
```

예:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

## JWT 로그인 이후 흐름

JWT 적용 후 로그인 흐름은 이렇게 된다.

```text
1. 사용자가 email/password로 로그인 요청
2. AuthService가 email/password 검증
3. 성공하면 JwtTokenProvider가 accessToken 생성
4. AuthResponse에 accessToken 포함
5. 클라이언트가 accessToken 저장
6. 이후 API 요청마다 Authorization 헤더에 토큰 첨부
```

응답 예:

```json
{
  "userId": 1,
  "email": "test@test.com",
  "nickname": "maren",
  "accessToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

## JWT 인증 필터 느낌

JWT를 적용하면 요청이 Controller에 도착하기 전에 Security Filter를 지나간다.

```text
Client
-> JWT Filter
-> SecurityContext
-> Controller
-> Service
-> Repository
-> DB
```

JWT Filter가 하는 일:

```text
1. Authorization 헤더가 있는지 확인
2. Bearer 토큰을 꺼냄
3. 토큰 서명과 만료시간 검증
4. 토큰에서 userId 또는 email 추출
5. Spring SecurityContext에 로그인 사용자 정보 저장
```

그 뒤 Controller나 Service에서는 로그인 사용자 정보를 꺼내 쓸 수 있다.

현재 KuroStep은 임시로 이렇게 받는다.

```java
@RequestParam Long userId
```

JWT 적용 후 목표는 이런 방향이다.

```java
public CreatorTaskResponse create(
        @AuthenticationPrincipal LoginUser loginUser,
        @Valid @RequestBody CreatorTaskCreateRequest request
) {
    return creatorTaskService.create(loginUser.userId(), request);
}
```

즉 URL에서 `userId`를 받지 않고, 토큰에서 인증된 사용자 ID를 꺼낸다.

## permitAll과 authenticated

Spring Security 설정에서 자주 보는 말이다.

`permitAll`:

```text
로그인하지 않아도 접근 가능
```

예:

- 회원가입
- 로그인
- Swagger
- H2 console

`authenticated`:

```text
로그인한 사용자만 접근 가능
```

예:

- 내 작업 카드 조회
- 플레이리스트 생성
- 번역 메모 수정

## 인증과 인가

보안에서 자주 헷갈리는 단어이다.

인증 Authentication:

```text
너 누구야?
로그인했어?
토큰이 유효해?
```

인가 Authorization:

```text
너 이 데이터에 접근할 권한 있어?
이 작업 카드가 네 거야?
```

KuroStep 예:

```text
JWT 검증 성공
-> 인증 성공

task.user.id == loginUser.id 확인
-> 인가 성공
```

Spring Security가 인증을 해도 Service에서 소유권 검증은 계속 필요하다.

## KuroStep에서 완성해야 할 보안 흐름

1. `AuthResponse`에 `accessToken` 필드 추가
2. JWT 생성/검증 클래스 추가
3. 로그인 성공 시 JWT 발급
4. JWT Filter 추가
5. `SecurityConfig`에서 회원가입/로그인만 `permitAll`
6. 나머지 API는 `authenticated`
7. Controller의 임시 `@RequestParam Long userId`를 로그인 사용자 정보로 교체
8. Service의 소유권 검증은 유지

## 한 문장 요약

Spring Security는 요청이 Controller에 오기 전에 “로그인한 요청인지” 검사한다.

JWT는 로그인 성공 후 클라이언트가 들고 다니는 신분증 같은 토큰이다.

Service의 소유권 검증은 “그 신분증을 가진 사용자가 이 데이터의 주인인지” 확인하는 단계이다.

