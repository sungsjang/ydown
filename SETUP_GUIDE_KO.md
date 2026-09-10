# YDown 1.0 처음 설치 매뉴얼

이 문서는 Supabase와 Vercel을 처음 사용하는 사람을 기준으로 작성했습니다. 순서대로 진행하면 아이폰이나 외부 PC의 웹페이지에서 YouTube 주소를 등록하고, 집의 Windows PC가 자동으로 영상 또는 MP3를 내려받게 됩니다.

YDown은 YouTube API를 사용하지 않습니다. Windows PC의 `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`가 실제 다운로드와 변환을 담당합니다.

## 완성 후 동작 방식

1. 아이폰에서 Vercel의 YDown 주소를 엽니다.
2. 비밀번호로 로그인하고 YouTube 주소와 저장 형식을 선택합니다.
3. 작업이 Supabase에 대기 상태로 저장됩니다.
4. 집의 `ydown.exe`가 작업을 가져갑니다.
5. 파일이 `C:\Users\sungs\Downloads\YDown` 같은 PC 폴더에 저장됩니다.

Vercel과 Supabase는 외부에서 접속할 수 있고, 집 PC는 밖에서 들어오는 연결을 받을 필요가 없습니다. 따라서 공유기 포트 포워딩이나 고정 IP가 필요하지 않습니다.

## 준비물

- GitHub 계정
- Supabase 계정
- Vercel 계정
- 집에서 계속 켜 둘 Windows PC
- 이 GitHub 저장소: <https://github.com/sungsjang/ydown>
- PC에 있는 `yt-dlp.exe`, `ffmpeg.exe`, `ffprobe.exe`

현재 PC에는 아래 세 파일이 이미 있습니다.

```text
C:\Users\sungs\Desktop\자작프로그램모음\중식-mp3다운로더\yt-dlp.exe
C:\Users\sungs\Desktop\자작프로그램모음\중식-mp3다운로더\ffmpeg.exe
C:\Users\sungs\Desktop\자작프로그램모음\중식-mp3다운로더\ffprobe.exe
```

중요: Supabase와 Vercel의 무료 사용량 및 정책은 바뀔 수 있습니다. 가입 화면에 표시되는 요금제와 한도를 확인한 뒤 진행하세요.

## 1단계: YDown 비밀값 만들기

먼저 웹 로그인 비밀번호와 PC 에이전트용 비밀 토큰을 만듭니다. 이 단계는 한 번만 하면 됩니다.

1. Windows에서 PowerShell을 엽니다.
2. 아래 명령으로 저장소 폴더로 이동합니다.

```powershell
cd "C:\Users\sungs\Documents\영단어 학습 프로그램\ydown"
```

3. 다음 명령을 실행합니다.

```powershell
npm install
npm run secrets -- "여기에-10자-이상의-나만의-긴-비밀번호"
```

따옴표 안의 문장은 실제 로그인에 사용할 비밀번호로 바꾸세요. 실행 결과는 다음 네 종류입니다.

```text
ADMIN_PASSWORD_HASH=...
SESSION_SECRET=...
AGENT_TOKEN=...
AGENT_TOKEN_HASH=...
```

메모장에 네 줄을 임시로 복사해 둡니다. 변수 이름에 따라 저장 위치가 다릅니다.

| 이름 | 저장할 곳 | 의미 |
|---|---|---|
| `ADMIN_PASSWORD_HASH` | Vercel | 로그인 비밀번호의 안전한 해시 |
| `SESSION_SECRET` | Vercel | 로그인 세션 보호용 비밀값 |
| `AGENT_TOKEN_HASH` | Vercel | PC 토큰을 검사하는 해시 |
| `AGENT_TOKEN` | Windows PC의 `.env` | PC가 YDown 서버에 접속할 때 쓰는 원문 토큰 |

`AGENT_TOKEN`과 `AGENT_TOKEN_HASH`는 반드시 같은 실행 결과에서 나온 한 쌍이어야 합니다. 이 값들을 GitHub, 문자, 공개 메모에 올리지 마세요.

## 2단계: Supabase 프로젝트 만들기

1. <https://supabase.com/dashboard>를 엽니다.
2. GitHub 계정 등으로 로그인합니다.
3. 조직이 없다면 새 조직을 만듭니다. 개인 사용이라면 무료 요금제를 선택해도 됩니다.
4. **New project**를 누릅니다.
5. 다음처럼 입력합니다.
   - **Name**: `ydown`
   - **Database Password**: 자동 생성하거나 긴 비밀번호 입력
   - **Region**: 한국에서 가까운 지역
6. **Create new project**를 누르고 준비가 끝날 때까지 기다립니다.

데이터베이스 비밀번호는 YDown 환경변수에는 넣지 않지만, 나중에 프로젝트를 관리할 때 필요할 수 있으므로 비밀번호 관리자에 보관하세요.

Supabase 공식 시작 문서도 Dashboard에서 프로젝트를 만든 다음 SQL Editor에서 SQL을 실행하는 흐름을 안내합니다: <https://supabase.com/docs/guides/getting-started/quickstarts/reactjs>

## 3단계: Supabase에 YDown 표와 함수를 만들기

1. Supabase에서 방금 만든 `ydown` 프로젝트를 엽니다.
2. 왼쪽 메뉴의 **SQL Editor**를 누릅니다.
3. **New query**를 누릅니다.
4. PC에서 다음 파일을 메모장이나 코드 편집기로 엽니다.

```text
C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\database\schema.sql
```

5. 파일 내용을 전부 복사해 Supabase SQL Editor에 붙여 넣습니다.
6. 오른쪽 아래 또는 위쪽의 **Run**을 누릅니다.
7. 오류 없이 완료되었다는 메시지가 나오면 성공입니다.

확인하려면 왼쪽 **Table Editor**에서 아래 표 세 개가 보이는지 확인합니다.

- `jobs`
- `job_events`
- `agents`

Supabase는 Dashboard의 SQL Editor에서 SQL 명령을 실행할 수 있습니다. 공식 설명: <https://supabase.com/docs/guides/database/overview>

## 4단계: Supabase URL과 서버 비밀키 복사하기

YDown의 Vercel 서버가 Supabase에 작업을 기록하려면 두 값이 필요합니다.

### Project URL

1. Supabase 프로젝트 상단의 **Connect**를 누릅니다.
2. 표시되는 Project URL 또는 Data API URL을 복사합니다.
3. 보통 다음 모양입니다.

```text
https://abcdefghijk.supabase.co
```

대시보드 버전에 따라 **Integrations → Data API**에서 URL을 찾을 수도 있습니다.

### Secret key

1. 왼쪽 아래 **Settings**를 누릅니다.
2. **API Keys**를 누릅니다.
3. 다음 중 하나를 복사합니다.
   - 권장: `sb_secret_`로 시작하는 **Secret key**
   - 구형 프로젝트: **service_role** 키
4. 눈 모양 또는 **Reveal** 버튼이 있다면 눌러 값을 표시한 뒤 복사합니다.

YDown의 환경변수 이름은 호환성을 위해 `SUPABASE_SERVICE_ROLE_KEY`이지만, 그 값에는 새 형식의 `sb_secret_...` 키를 넣어도 됩니다.

주의: Secret/service_role 키는 데이터베이스의 모든 행에 접근할 수 있습니다. 브라우저 코드, PC 에이전트, GitHub 파일에 넣지 말고 Vercel 서버 환경변수에만 넣으세요. Supabase 공식 키 안내: <https://supabase.com/docs/guides/getting-started/api-keys>

## 5단계: Vercel에 GitHub 저장소 연결하기

1. <https://vercel.com>을 엽니다.
2. **Log In** 또는 **Sign Up**을 누르고 GitHub로 로그인합니다.
3. Vercel Dashboard에서 **Add New... → Project**를 누릅니다.
4. GitHub 연결 권한을 묻는 화면이 나오면 `sungsjang/ydown` 저장소를 Vercel이 읽을 수 있도록 허용합니다.
5. 저장소 목록에서 `ydown`을 찾고 **Import**를 누릅니다.
6. 설정 화면은 다음처럼 둡니다.
   - **Project Name**: `ydown`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./` 또는 비워 둠
   - Build Command와 Output Directory: 기본값

아직 **Deploy**를 누르기 전에 환경변수를 입력하는 편이 가장 쉽습니다. Vercel의 공식 Git 배포 설명: <https://vercel.com/docs/git>

## 6단계: Vercel 환경변수 5개 입력하기

Import 화면의 **Environment Variables**를 펼칩니다. 아래 이름과 값을 한 줄씩 추가합니다.

| Vercel 변수 이름 | 넣을 값 |
|---|---|
| `SUPABASE_URL` | 4단계의 `https://...supabase.co` 주소 |
| `SUPABASE_SERVICE_ROLE_KEY` | 4단계의 `sb_secret_...` 또는 service_role 키 |
| `ADMIN_PASSWORD_HASH` | 1단계 결과의 같은 이름 값 |
| `SESSION_SECRET` | 1단계 결과의 같은 이름 값 |
| `AGENT_TOKEN_HASH` | 1단계 결과의 같은 이름 값 |

입력할 때 주의할 점:

- 왼쪽에는 변수 이름만, 오른쪽에는 `=` 뒤의 값만 넣습니다.
- 앞뒤 따옴표는 넣지 않습니다.
- 가능하면 **Production**, **Preview**, **Development**를 모두 선택합니다.
- `AGENT_TOKEN` 원문은 Vercel에 넣지 않습니다.

다섯 개를 모두 추가한 뒤 **Deploy**를 누릅니다. 빌드가 끝나면 `https://ydown-....vercel.app` 형태의 주소가 생깁니다. **Visit**을 눌러 로그인 화면이 나오는지 확인합니다.

환경변수를 배포가 끝난 후 추가하거나 수정했다면 반드시 새로 배포해야 합니다.

1. Vercel 프로젝트의 **Deployments**로 이동합니다.
2. 최신 Production 배포 오른쪽의 점 세 개 메뉴를 누릅니다.
3. **Redeploy**를 누릅니다.

Vercel 공식 문서도 환경변수 변경은 기존 배포에 적용되지 않고 새 배포에만 적용된다고 설명합니다: <https://vercel.com/docs/environment-variables>

## 7단계: ydown.exe 1.0 준비하기

이 PC에서 만든 실행 파일은 다음 위치에 있습니다.

```text
C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\pc-agent\dist\ydown.exe
```

파일 속성의 세부 정보에서 파일 버전과 제품 버전이 모두 `1.0`으로 표시됩니다. 이 실행 파일은 Python이 없는 Windows PC에서도 실행할 수 있습니다.

직접 다시 만들고 싶다면 PowerShell에서 다음을 실행합니다.

```powershell
cd "C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\pc-agent"
python -m pip install pyinstaller
powershell -ExecutionPolicy Bypass -File .\build-exe.ps1
```

GitHub에서도 새 코드가 push될 때 Windows용 실행 파일을 만듭니다. GitHub 저장소의 **Actions → 최신 CI 실행 → Artifacts → ydown-windows-1.0**에서 받을 수 있습니다. Actions 산출물에는 `ydown.exe`가 들어 있습니다.

## 8단계: PC 에이전트의 .env 만들기

`ydown.exe`와 같은 `dist` 폴더에 설정 파일을 만듭니다.

1. 아래 파일을 복사합니다.

```text
원본: pc-agent\dist\.env.example
복사본: pc-agent\dist\.env
```

PowerShell로 하려면:

```powershell
cd "C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\pc-agent\dist"
Copy-Item .env.example .env
notepad .env
```

2. `.env`를 다음과 같이 수정합니다. Vercel 주소와 `AGENT_TOKEN`은 자신의 값으로 바꾸세요.

```text
YDOWN_API_URL=https://내-프로젝트.vercel.app
YDOWN_AGENT_TOKEN=1단계에서-만든-AGENT_TOKEN-원문
YDOWN_AGENT_ID=home-windows-pc
YDOWN_DOWNLOAD_DIR=C:\Users\sungs\Downloads\YDown
YDOWN_YTDLP=C:\Users\sungs\Desktop\자작프로그램모음\중식-mp3다운로더\yt-dlp.exe
YDOWN_FFMPEG=C:\Users\sungs\Desktop\자작프로그램모음\중식-mp3다운로더\ffmpeg.exe
YDOWN_FFPROBE=C:\Users\sungs\Desktop\자작프로그램모음\중식-mp3다운로더\ffprobe.exe
YDOWN_FFMPEG_LOCATION=C:\Users\sungs\Desktop\자작프로그램모음\중식-mp3다운로더
YDOWN_MAX_PLAYLIST_ITEMS=50
YDOWN_IDLE_POLL_SECONDS=30
```

설정 의미:

- `YDOWN_API_URL`: Vercel이 알려 준 실제 주소. 끝에 `/`는 없어도 됩니다.
- `YDOWN_AGENT_TOKEN`: 1단계에서 만든 원문 토큰.
- `YDOWN_AGENT_ID`: 이 PC를 구분하는 이름. 영문, 숫자, 하이픈 사용을 권장합니다.
- `YDOWN_DOWNLOAD_DIR`: 완성 파일이 저장될 폴더. 없으면 자동 생성됩니다.
- `YDOWN_MAX_PLAYLIST_ITEMS`: 한 플레이리스트에서 받을 최대 항목 수.
- `YDOWN_IDLE_POLL_SECONDS`: 할 일이 없을 때 확인하는 최대 간격.

`.env`는 확장자가 붙지 않은 정확한 파일명이어야 합니다. 메모장이 `.env.txt`로 저장하지 않도록 주의하세요.

## 9단계: 처음 실행하고 다운로드 시험하기

오류 메시지를 볼 수 있도록 처음에는 더블클릭보다 PowerShell 실행을 권장합니다.

```powershell
cd "C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\pc-agent\dist"
.\ydown.exe
```

정상이면 다음과 비슷한 문장이 나타나고 창이 계속 열려 있습니다.

```text
YDown Agent 1.0 started
```

그 상태에서 시험합니다.

1. 아이폰 또는 다른 PC에서 Vercel 주소를 엽니다.
2. 1단계에서 입력했던 원래 로그인 비밀번호로 로그인합니다.
3. 본인이 저장할 권한이 있는 짧은 YouTube 영상 주소를 붙여 넣습니다.
4. 처음에는 **MP3** 또는 **영상** 하나만 선택합니다.
5. 다운로드 작업을 등록합니다.
6. 웹에서 상태가 대기 → 다운로드 중 → 완료로 변하는지 봅니다.
7. `C:\Users\sungs\Downloads\YDown`에 파일이 생겼는지 확인합니다.

에이전트를 수동으로 멈추려면 PowerShell 창에서 `Ctrl+C`를 누릅니다.

## 10단계: Windows 로그인 시 자동 실행하기

수동 시험이 성공한 뒤 PowerShell을 열어 다음을 실행합니다.

```powershell
cd "C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\pc-agent"
powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1
```

Windows 작업 스케줄러에 `YDown Agent`가 등록되고 바로 시작됩니다. 확인 방법:

1. 시작 메뉴에서 **작업 스케줄러**를 검색해 엽니다.
2. 왼쪽의 **작업 스케줄러 라이브러리**를 누릅니다.
3. `YDown Agent`를 찾습니다.
4. 상태 또는 마지막 실행 결과를 확인합니다.

로그는 다음 파일에 누적됩니다.

```text
C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\pc-agent\dist\logs\agent.log
```

## 11단계: 아이폰에서 쓰기 편하게 만들기

가장 간단한 방법은 Safari에서 Vercel 주소를 연 뒤 홈 화면에 추가하는 것입니다.

1. Safari에서 YDown Vercel 주소를 엽니다.
2. 공유 버튼을 누릅니다.
3. **홈 화면에 추가**를 누릅니다.

이제 아이폰 밖의 네트워크에서도 같은 주소로 접속할 수 있습니다. 로그인 비밀번호는 다른 사이트와 겹치지 않는 긴 비밀번호를 사용하세요.

## 문제 해결

### 웹페이지에 로그인할 수 없음

- `npm run secrets`에 입력했던 원래 비밀번호를 사용했는지 확인합니다.
- Vercel의 `ADMIN_PASSWORD_HASH` 값에 `ADMIN_PASSWORD_HASH=` 부분까지 넣지 않았는지 확인합니다.
- 환경변수 수정 후 **Redeploy**했는지 확인합니다.

### 웹에서 500 오류가 표시됨

- Supabase SQL Editor에서 `schema.sql` 전체를 실행했는지 확인합니다.
- `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 같은 Supabase 프로젝트의 값인지 확인합니다.
- Vercel의 **Deployments → 해당 배포 → Logs**에서 오류를 확인합니다.

### ydown.exe 창이 바로 닫힘

더블클릭하지 말고 PowerShell에서 실행하면 오류가 보입니다.

```powershell
cd "C:\Users\sungs\Documents\영단어 학습 프로그램\ydown\pc-agent\dist"
.\ydown.exe
```

대부분 `.env`가 없거나, 필수 값이 비어 있거나, 실행 파일 경로가 틀린 경우입니다.

### 작업이 계속 대기 중임

- 집 PC가 켜져 있는지 확인합니다.
- `ydown.exe`가 실행 중인지 확인합니다.
- `.env`의 `YDOWN_API_URL`이 실제 Vercel 주소인지 확인합니다.
- `.env`의 `AGENT_TOKEN`과 Vercel의 `AGENT_TOKEN_HASH`가 같은 생성 결과의 한 쌍인지 확인합니다.
- `dist\logs\agent.log`를 확인합니다.

### yt-dlp 또는 ffmpeg를 찾을 수 없다고 나옴

`.env`의 `YDOWN_YTDLP`, `YDOWN_FFMPEG`, `YDOWN_FFPROBE`, `YDOWN_FFMPEG_LOCATION`에 위의 실제 절대 경로를 넣었는지 확인합니다.

### Windows가 알 수 없는 게시자라고 경고함

현재 `ydown.exe`는 이 PC에서 소스 코드로 직접 만든 서명되지 않은 개인용 실행 파일입니다. 자신이 만든 저장소와 빌드 파일임을 확인한 경우에만 Windows의 **추가 정보 → 실행**을 선택하세요.

## 보안 및 사용 주의

- `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `AGENT_TOKEN`을 다른 사람에게 보내지 마세요.
- `.env` 파일을 GitHub에 올리지 마세요. 저장소 설정상 자동 제외되어 있습니다.
- 키가 노출되면 새 비밀값을 만들고 Vercel과 PC 양쪽 값을 함께 교체하세요.
- Vercel 주소는 외부에 공개되어 있으므로 강한 로그인 비밀번호를 사용하세요.
- 본인이 다운로드하고 저장할 권한이 있는 콘텐츠에만 사용하고, YouTube 약관과 저작권을 준수하세요.

## 설치 완료 체크표

- [ ] Supabase 프로젝트 `ydown`을 만들었다.
- [ ] `database/schema.sql`을 SQL Editor에서 실행했다.
- [ ] Vercel에 GitHub의 `sungsjang/ydown`을 Import했다.
- [ ] Vercel 환경변수 5개를 입력하고 배포했다.
- [ ] `pc-agent\dist\ydown.exe`의 버전이 1.0이다.
- [ ] `dist\.env`를 만들고 Vercel 주소와 AGENT_TOKEN을 입력했다.
- [ ] yt-dlp, ffmpeg, ffprobe의 실제 경로를 입력했다.
- [ ] 수동 다운로드 시험에 성공했다.
- [ ] Windows 자동 실행을 등록했다.

