# 가사 조회 검증

KuroStep의 가사 조회는 YouTube 영상 자체에서 가사를 추출하는 방식이 아닙니다. YouTube 링크에서 곡 제목과 아티스트를 정리한 뒤, LRCLIB에서 해당 곡의 가사를 검색합니다.

## 🔎 검증 기준

- 공식 MV 또는 Topic 음원처럼 제목과 아티스트가 명확한 곡을 기준으로 확인했습니다.
- 리믹스, 1시간 반복, 플레이리스트 모음, 커버 영상, 사용자가 임의 편집한 영상은 실패 가능성이 높습니다.
- LRCLIB에 등록되지 않은 곡은 공식 MV여도 조회되지 않을 수 있습니다.

## ✅ 2026-06-16 샘플 확인

아래 샘플은 LRCLIB 검색 API에서 결과와 synced lyrics 존재 여부를 확인한 목록입니다.

| 검색어 | 결과 | synced lyrics |
|---|---:|---:|
| Never Gonna Give You Up Rick Astley | 성공 | 있음 |
| APT. ROSÉ Bruno Mars | 성공 | 있음 |
| Ditto NewJeans | 성공 | 있음 |
| Hype Boy NewJeans | 성공 | 있음 |
| Love wins all IU | 성공 | 있음 |
| Drama aespa | 성공 | 있음 |
| Catch Catch YENA | 성공 | 있음 |
| Moon Shadow AHN YE EUN | 성공 | 있음 |

## 🛠️ 현재 구현 방식

```text
YouTube URL 입력
-> 영상 ID 추출
-> noembed / YouTube oEmbed로 제목, 채널명 조회
-> 제목에서 official MV, lyrics, 4K 등 노이즈 제거
-> LRCLIB 검색 후보 생성
-> track_name + artist_name 검색
-> q 검색 fallback
-> syncedLyrics 또는 plainLyrics 반환
```

## ⚠️ 한계

| 케이스 | 처리 |
|---|---|
| 긴 모음 영상 | 긴 영상 또는 제목 패턴을 보고 가사 조회 대상에서 제외 |
| 리믹스/라이브/커버 | 원곡과 싱크가 다를 수 있어 실패 가능 |
| LRCLIB 미등록 곡 | 사용자에게 친근한 안내 메시지 표시 |
| YouTube 광고/계정 제한 | 앱이 광고를 우회하지 않음. 공식 플레이어 상태를 안내 |

## 📌 개선 계획

- LRCLIB 실패 시 다른 Provider를 검색 후보로 추가
- 제목 정규화 규칙을 테스트 케이스로 고정
- 곡 길이와 LRCLIB duration을 비교해 잘못된 가사 매칭 방지
- 사용자가 직접 가사 파일을 가져와 로컬 캐시로 저장하는 옵션 검토
