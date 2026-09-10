# YDown

아이폰이나 외부 브라우저에서 YouTube 주소를 등록하면 내 Windows PC가 `yt-dlp`와 `ffmpeg`로 영상 또는 MP3를 내려받는 개인용 작업함입니다. YouTube API를 사용하지 않으며 PC에 인바운드 포트를 열지 않습니다.

## 구성

- **Vercel**: Next.js 웹 화면과 인증된 API
- **Supabase**: 다운로드 작업, 상태, 진행률 보관
- **Windows PC Agent**: 작업을 가져와 실제 다운로드
- **저장소**: PC의 `YDOWN_DOWNLOAD_DIR`

PC가 꺼져 있으면 작업은 Supabase에서 대기하고, 에이전트가 다시 실행되면 오래된 작업부터 처리합니다.

## 1. Supabase 준비

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 [`database/schema.sql`](database/schema.sql)을 실행합니다.
3. Project Settings에서 Project URL과 `service_role` 키를 확인합니다.

테이블은 RLS가 활성화되어 있고 공개 정책이 없습니다. `service_role` 키는 Vercel 서버 환경변수에만 저장해야 합니다.

## 2. 비밀값 생성

Node.js가 설치된 PC에서 저장소 루트에서 실행합니다.

```powershell
npm install
npm run secrets -- "웹페이지에서 사용할 긴 비밀번호"
```

출력되는 값 중:

- `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `AGENT_TOKEN_HASH`는 Vercel에 등록
- `AGENT_TOKEN`은 PC Agent의 `.env`에 등록

`AGENT_TOKEN` 원문은 다시 만들 수 없으므로 안전한 곳에 보관합니다.

## 3. Vercel 배포

GitHub의 `ydown` 저장소에 이 프로젝트를 push하고 Vercel에서 **Add New Project → Import Git Repository**로 가져옵니다. Framework Preset은 Next.js, Root Directory는 저장소 루트로 둡니다.

Vercel 환경변수:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PASSWORD_HASH
SESSION_SECRET
AGENT_TOKEN_HASH
```

설정 후 배포합니다. 로컬 개발용 값은 `.env.example`을 `.env.local`로 복사해 입력합니다.

## 4. Windows PC Agent 설치

Python 3.11 이상과 ffmpeg가 필요합니다. PowerShell에서:

```powershell
cd pc-agent
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

`.env`의 다음 값을 수정합니다.

```text
YDOWN_API_URL=https://내-vercel-주소.vercel.app
YDOWN_AGENT_TOKEN=비밀값-생성단계의-AGENT_TOKEN
YDOWN_AGENT_ID=home-windows-pc
YDOWN_DOWNLOAD_DIR=C:\Users\내계정\Downloads\YDown
```

`ffmpeg.exe`가 PATH에 없다면 `YDOWN_FFMPEG`, `YDOWN_FFPROBE`, `YDOWN_FFMPEG_LOCATION`에 실제 경로를 입력합니다.

에이전트 직접 실행:

```powershell
.\.venv\Scripts\python.exe agent.py
```

정상 동작을 확인한 뒤 로그인할 때 자동 실행되도록 등록합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1
```

## 다운로드 규칙

- 영상: 최고 비디오와 최고 오디오를 받아 MKV로 병합
- MP3: 최고 오디오를 MP3 최고품질로 변환
- 영상 + MP3: 영상을 한 번 받은 후 로컬 ffmpeg로 MP3 생성
- 플레이리스트: 기본 최대 50개, 순번과 영상 ID를 파일명에 포함
- 중복 실행: 에이전트 잠금 파일로 방지
- 취소: 웹의 취소 요청을 에이전트가 감지해 프로세스 트리 종료
- 재시작: yt-dlp의 `.part` 파일로 이어받기

## 개발 및 검사

```powershell
npm run dev
npm run lint
npm run build
python -m unittest discover -s pc-agent/tests -v
```

## 저장소 구조

```text
app/                  Next.js 페이지와 API
components/           로그인·다운로드 작업 화면
database/schema.sql   Supabase 스키마와 원자적 작업 claim 함수
lib/                  인증, 검증, Supabase 서버 클라이언트
pc-agent/             Windows 다운로드 에이전트
scripts/              비밀번호·토큰 생성 도구
```

## 보안 메모

- `.env`, `.env.local`, `pc-agent/.env`는 Git에 포함되지 않습니다.
- 웹에서는 HTTPS YouTube 주소와 제한된 옵션만 받을 수 있습니다.
- 다운로드 명령은 `shell=True` 없이 인자 배열로 실행됩니다.
- Supabase `service_role` 키를 브라우저나 PC Agent에 넣지 마세요.
- 본인이 저장할 권한이 있는 콘텐츠에만 사용하세요.
