# YouTube 트렌드 리서치 에이전트

goorm **YouTube 트렌드 리서치 에이전트 기술명세서 v0.1** 기반 **Phase 1 MVP** 구현 프로젝트입니다.

**저장소:** https://github.com/doyichoi/YOUTUBE

---

## 이번 작업 요약 (2026-06-04)

### 구현 범위

| 항목 | 내용 |
|------|------|
| 기반 명세 | YouTube Trend Research Agent 기술명세서 v0.1 (Phase 1) |
| LLM 변경 | 명세서 **Claude API** → MVP **OpenAI GPT API** (`gpt-4o-mini` 기본) |
| 에이전트 | ① Search Agent, ② Video Stats Agent, Orchestrator 통합 |
| 실행 방식 | **CLI** (`npm run research`) + **웹 대시보드** (`npm run web`, 포트 5151) |
| 출력 | `reports/*.md`, `reports/*.json` (명세서 5.1 리포트 형식) |
| 보안 | API 키는 `.env`만 사용, `.gitignore`에 `.env`·`reports/` 제외 |

### 아키텍처

```
키워드 입력 (CLI 또는 웹 UI)
        ↓
   Orchestrator Agent
        ├─ ① Search Agent       → YouTube search.list (viewCount, publishedAfter)
        └─ ② Video Stats Agent → videos.list + 급상승 스코어
        ↓
   OpenAI GPT (트렌드 요약 · 제목 패턴 · 채널별 콘텐츠 아이디어)
        ↓
   Markdown / JSON 리포트 (+ 웹에서 Top 10 테이블 미리보기)
```

**급상승 스코어:** `조회수 ÷ max(1, 게시 후 경과 시간(시간))`

| 판정 | 조건 |
|------|------|
| 🔥 급상승 | 게시 24시간 이내 & 시간당 조회 > 10,000 |
| 📈 상승세 | 게시 7일 이내 & 시간당 조회 > 3,000 |

### OpenAI 분석 태스크 (명세서 4.1 대응)

1. **트렌드 요약** — 급부상 토픽 3~5개  
2. **제목 패턴 분석** — 숫자형·의문형·비교형 등 + 추천 제목 공식  
3. **콘텐츠 아이디어** — NXP 블로그 / AI 뉴스 / 쇼츠 채널별 제안  

---

## 오류 수정 및 개선 사항

| 구분 | 문제 | 조치 |
|------|------|------|
| TypeScript | `extractSection()`이 TASK 3 파싱 시 `endPattern` 인자 누락으로 빌드 실패 (`TS2554`) | `endPattern`을 선택 인자로 변경, 마지막 섹션은 끝까지 추출 |
| Orchestrator | 웹 API 연동 시 파일 저장·분석 결과 반환이 CLI에만 맞춰져 있음 | `writeReports`, `onProgress` 옵션 추가, `analysis`를 응답에 포함 |
| 웹 서버 | Phase 1은 CLI만 존재 | `src/server.ts` + `public/` 대시보드 추가, `POST /api/research`, `GET /api/health` |
| API 키 | 로컬 설정 혼선 | `.env.example` 제공, `.env`는 Git 제외, 웹은 서버 `.env`만 참조 (브라우저 노출 없음) |

---

## 빠른 시작

### 1. 설치

```bash
git clone https://github.com/doyichoi/YOUTUBE.git
cd YOUTUBE
npm install
```

### 2. 환경 변수

```bash
cp .env.example .env
# .env에 키 입력 (Git에 올리지 않음)
chmod 600 .env
```

| 변수 | 필수 | 설명 |
|------|------|------|
| `YOUTUBE_API_KEY` | ✅ | YouTube Data API v3 |
| `OPENAI_API_KEY` | 분석 시 | OpenAI Platform |
| `OPENAI_MODEL` | 선택 | 기본 `gpt-4o-mini` |
| `PORT` | 선택 | 웹 서버 포트, 기본 `5151` |

### 3. 웹 대시보드

```bash
npm run web
```

→ http://127.0.0.1:5151

- 키워드·기간·검색 수·지역 설정 후 **리서치 실행**
- 우측 상단에서 YouTube / OpenAI 키 연결 상태 확인 (`/api/health`)

### 4. CLI

```bash
npm run research -- "AI 에이전트"
npm run research -- "ChatGPT" --skip-llm   # OpenAI 생략
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--days` | 7 | 검색 기간(일) |
| `--max` | 25 | search 결과 수 (최대 50) |
| `--region` | KR | `regionCode` |
| `--lang` | ko | `relevanceLanguage` |
| `--out` | ./reports | 저장 경로 |
| `--skip-llm` | - | GPT 분석 생략 |

---

## API (웹 서버)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/health` | API 키 설정 여부 (값 미노출) |
| `POST` | `/api/research` | 리서치 실행 JSON body: `keyword`, `daysBack`, `maxResults`, `regionCode`, `language`, `skipLlm` |

---

## YouTube API Quota

| 호출 | 유닛 |
|------|------|
| `search.list` 1회 | 100 |
| `videos.list` 1회 (≤50 ID) | 1 |

**1회 실행 ≈ 101 유닛** (하루 10,000 유닛 기준 약 90회 이하 권장)

---

## 프로젝트 구조

```
src/
  index.ts                 # CLI 엔트리
  server.ts                # 웹 서버 (포트 5151)
  agents/
    searchAgent.ts         # ① Search
    videoStatsAgent.ts     # ② Video Stats
    orchestrator.ts        # 통합·리포트 저장
  youtube/client.ts        # Data API v3
  openai/analyzer.ts       # GPT 분석
  report/markdown.ts       # 리포트 포맷
  utils/scoring.ts         # 급상승 스코어
public/
  index.html, app.js, styles.css   # 웹 UI
```

---

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run web` | 웹 대시보드 (기본 포트 5151) |
| `npm run research -- "<키워드>"` | CLI 리서치 |
| `npm run typecheck` | TypeScript 검사 |
| `npm run build` | `dist/` 빌드 |

---

## 로드맵

- **Phase 1 (완료):** Search + Video Stats + OpenAI + CLI/웹  
- **Phase 2:** Channel / Pattern 에이전트, GitHub Actions 스케줄, DB  
- **Phase 3:** MCP Tool 공개  

---

NextPlatform · YouTube Trend Research Agent v0.1
