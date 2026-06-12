# Vercel + 구글시트 Webhook 운영 흐름

## 역할 분리

- Vercel
  - 학생용 `/career` 웹앱 제공
  - PDF 업로드 처리
  - OpenAI 분석
  - 알라딘 API 도서 조회
  - 추천 도서 카드 표시
- Apps Script
  - `AI분석기록` 시트 저장
  - `도서선택기록` 시트 저장
  - 같은 학생의 AI 분석 1회, 도서 선택 1회 여부 확인

## Vercel 환경변수

Vercel 프로젝트 Settings > Environment Variables에 아래 값을 넣습니다.

- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_REASONING`
- `ALADIN_TTB_KEY`
- `GOOGLE_SHEET_WEBHOOK_URL`
- `APP_SECRET`
- `APP_ACCESS_CODE`

`APP_SECRET`은 선택이지만, 공개 수업 URL이면 설정하는 것을 권장합니다. 설정했다면 Apps Script의 `APP_SECRET`에도 같은 값을 넣습니다.

## Apps Script 설정

1. 구글 시트에서 `확장 프로그램 > Apps Script`를 엽니다.
2. 이 폴더의 `Code.gs`를 붙여 넣습니다.
3. `APP_SECRET`을 Vercel 환경변수와 같은 값으로 입력합니다. 비워두면 secret 검사를 하지 않습니다.
4. 웹앱으로 배포합니다.
5. 배포 URL을 Vercel의 `GOOGLE_SHEET_WEBHOOK_URL`에 입력합니다.

## 학생 사용 흐름

1. 학생이 Vercel 앱의 `/career`에 접속합니다.
2. 학년, 반, 번호, 이름을 입력합니다.
3. 가지고 있는 진로 검사 PDF를 하나 이상 업로드합니다.
4. Vercel이 Apps Script에 중복 여부를 짧게 확인합니다.
5. 중복이 없으면 Vercel이 OpenAI와 알라딘 API를 호출합니다.
6. 분석과 추천이 성공하면 Apps Script가 `AI분석기록`에 기록합니다.
7. 학생이 책을 선택하면 Apps Script가 `도서선택기록`에 기록합니다.
