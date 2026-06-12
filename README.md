# Career Planning

진로 검사 PDF를 업로드하면 Vercel의 Next.js API가 OpenAI로 분석하고, 알라딘 API 후보 도서 중 학생에게 맞는 책을 추천하는 웹앱입니다.

기존 `F:\palm-reading-book-template` 프로젝트와 분리된 새 프로젝트입니다.

## 주요 경로

- 학생 화면: `/career`
- 분석 및 추천 API: `/api/career/analyze`
- 도서 선택 저장 API: `/api/career/save-book-choice`
- 설정 확인 API: `/api/config`

## 환경 변수

Vercel 프로젝트의 Settings > Environment Variables에 아래 값을 넣습니다.

```text
OPENAI_API_KEY
OPENAI_TEXT_MODEL
OPENAI_REASONING
ALADIN_TTB_KEY
GOOGLE_SHEET_WEBHOOK_URL
APP_SECRET
APP_ACCESS_CODE
```

추천 기본값:

```text
OPENAI_TEXT_MODEL=gpt-5.4-mini
OPENAI_REASONING=medium
```

## 구글 시트 Webhook

구글 시트 쪽에는 `apps-script/career-vercel-webhook/Code.gs`를 Apps Script 웹앱으로 배포해서 사용합니다.

배포한 Apps Script 웹앱 URL을 Vercel의 `GOOGLE_SHEET_WEBHOOK_URL`에 넣고, Apps Script의 `APP_SECRET` 값과 Vercel의 `APP_SECRET` 값을 동일하게 맞춥니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 접속:

```text
http://localhost:3000/career
```

## GitHub 업로드

```powershell
cd F:\career-planning
git init
git branch -M main
git remote add origin https://github.com/Byeongeo/career-planning.git
git add .
git commit -m "Add career planning Vercel app"
git push -u origin main
```