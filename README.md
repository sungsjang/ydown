# YDown

아이폰이나 외부 브라우저에서 YouTube 주소를 등록하면 내 Windows PC가 `yt-dlp`와 `ffmpeg`로 영상 또는 MP3를 내려받는 개인용 작업함입니다. YouTube API를 사용하지 않으며 PC에 인바운드 포트를 열지 않습니다.

Supabase와 Vercel을 처음 사용한다면 클릭 순서부터 첫 다운로드 시험까지 설명한 **[YDown 1.0 처음 설치 매뉴얼](SETUP_GUIDE_KO.md)**을 먼저 따라 하세요.

## 구성

- **Vercel**: Next.js 웹 화면과 인증된 API
- **Supabase**: 다운로드 작업, 상태, 진행률 보관
- **Windows PC Agent**: 작업을 가져와 실제 다운로드
- **저장소**: PC의 `YDOWN_DOWNLOAD_DIR`

PC가 꺼져 있으면 작업은 Supabase에서 대기하고, 에이전트가 다시 실행되면 오래된 작업부터 처리합니다.

- 완료된 작업은 웹에서 하나 이상 선택해 Supabase 기록만 삭제할 수 있습니다. PC에 저장된 영상·MP3 파일은 지우지 않습니다.
- PC Agent는 실행할 때마다 `yt-dlp.exe -U`로 안정판 업데이트를 확인합니다. 업데이트 확인이 실패해도 설치된 버전으로 계속 실행합니다.
- **YouTube 검색** 탭에서 검색하고, 결과를 선택해 영상·MP3 다운로드를 등록할 수 있습니다. 검색도 PC의 yt-dlp로 처리하므로 검색 지원 버전의 `ydown.exe`가 실행 중이어야 합니다.

## 1. Supabase 준비

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 [`database/schema.sql`](database/schema.sql)을 실행합니다.
   이어서 검색 기능용 [`database/search.sql`](database/search.sql)을 실행합니다. 기존 설치는 `search.sql`만 추가 실행하면 됩니다.
3. Connect/API Keys에서 Project URL과 서버용 Secret key(또는 구형 `service_role` 키)를 확인합니다.

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

운영용 파일은 모두 `C:\ydownauto` 한 폴더에 둡니다. 저장소에서 EXE를 빌드한 뒤 로컬 설치 폴더를 구성합니다.

```powershell
cd pc-agent
python -m pip install pyinstaller
powershell -ExecutionPolicy Bypass -File .\build-exe.ps1
powershell -ExecutionPolicy Bypass -File .\assemble-local.ps1 -ToolSource "세 도구가 들어 있는 원본 폴더"
```

완성 구조:

```text
C:\ydownauto\ydown.exe
C:\ydownauto\yt-dlp.exe
C:\ydownauto\ffmpeg.exe
C:\ydownauto\ffprobe.exe
C:\ydownauto\.env
C:\ydownauto\downloads\
```

`C:\ydownauto\.env`에서 `YDOWN_API_URL`과 `YDOWN_AGENT_TOKEN`을 입력한 뒤 실행합니다.

```powershell
notepad C:\ydownauto\.env
C:\ydownauto\ydown.exe
```

이 구성은 기존 프로그램 폴더와 Python을 실행 시 참조하지 않습니다.

Python 소스로 직접 개발할 때만 아래 절차를 사용합니다.

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
YDOWN_DOWNLOAD_DIR=C:\ydownauto\downloads
```

세 실행 도구의 경로는 모두 `C:\ydownauto`로 설정합니다.

에이전트 직접 실행:

```powershell
.\.venv\Scripts\python.exe agent.py
```

정상 동작을 확인한 뒤 로그인할 때 자동 실행되도록 등록합니다.

```powershell
powershell -ExecutionPolicy Bypass -File C:\ydownauto\install-startup.ps1
```

## 다운로드 규칙

- 영상: 최고 비디오와 최고 오디오를 받아 MKV로 병합
- MP3: 최고 오디오를 MP3 최고품질로 변환
- 영상 + MP3: 영상을 한 번 받은 후 로컬 ffmpeg로 MP3 생성
- 플레이리스트: 기본 최대 50개, 순번과 영상 ID를 파일명에 포함
- 중복 실행: 에이전트 잠금 파일로 방지
- 취소: 웹의 취소 요청을 에이전트가 감지해 프로세스 트리 종료
- 재시작: yt-dlp의 `.part` 파일로 이어받기
- yt-dlp 업데이트: 에이전트가 시작할 때마다 공식 자체 업데이트(`-U`) 실행
- 완료 기록 삭제: 웹에서 선택한 `completed` 작업과 연결 이벤트를 Supabase에서 삭제, PC 파일은 유지

## YouTube 검색 사용법

1. PC에서 최신 YDown 실행파일을 실행합니다. 새 환경변수는 필요하지 않습니다.
2. 웹페이지의 **YouTube 검색** 탭에 검색어를 입력합니다.
3. 최대 20개 결과에서 영상·MP3 저장 형식을 고릅니다.
4. 개별 **다운로드**, 또는 체크 후 **선택 영상 다운로드**를 누릅니다.
5. 기존 작업 목록에서 진행 상태를 확인합니다. 파일은 기존 `YDOWN_DOWNLOAD_DIR`에 저장됩니다.

검색은 다운로드와 별도 작업으로 처리됩니다. PC가 꺼져 있으면 검색을 시작할 수 없으며, 오래된 실행파일은 검색을 지원하지 않습니다. 검색은 분당 6회, 동시에 대기·실행 중인 요청은 3개까지 허용합니다. 실시간 방송·방송 예정 결과는 제외합니다. 검색 결과는 24시간 후 만료되고, 실행 중인 검색 에이전트가 다음 확인 시 정리합니다. 검색 결과를 다시 내려받으려면 재검색하세요. 동일 검색·영상·저장 형식의 반복 등록은 하나의 작업으로 처리합니다.

## 개발 및 검사

```powershell
npm run dev
npm run lint
npm run test:db
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
