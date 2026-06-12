import { NextResponse } from "next/server";
import { verifyAccessCode } from "@/lib/access";

export const runtime = "nodejs";
export const maxDuration = 180;

type StudentInfo = {
  grade: string;
  classNo: string;
  studentNo: string;
  name: string;
};

type UploadedFile = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

type CareerDomain = {
  name: string;
  reading: string;
  keywords: string[];
  bookTopics: string[];
};

type CareerAnalysis = {
  summaryForSheet: string;
  studentReportMarkdown: string;
  recommendationDomains: CareerDomain[];
  recommendationQueries: string[];
};

type BookCandidate = {
  title: string;
  author: string;
  publisher: string;
  pubDate: string;
  pubYear: string;
  priceStandard: number;
  priceSales: number;
  isbn: string;
  cover: string;
  aladinLink: string;
  yes24Link: string;
  description: string;
  categoryName: string;
  customerReviewRank: number;
};

const TESTS = [
  { key: "interest", label: "커리어넷 진로흥미검사 PDF", fallbackName: "career-interest.pdf" },
  { key: "aptitude", label: "커리어넷 직업적성검사 PDF", fallbackName: "career-aptitude.pdf" },
  { key: "competency", label: "진로개발역량검사 PDF", fallbackName: "career-development-competency.pdf" }
] as const;

const DEFAULT_MODEL = "gpt-5.4-mini";
const RECENT_YEAR_CUTOFF = new Date().getFullYear() - 7;
const MAX_BOOK_CANDIDATES_FOR_AI = 60;

const ANALYSIS_SYSTEM_PROMPT = [
  "당신은 중학교 진로전담교사를 돕는 진로상담 AI입니다.",
  "학생이 업로드한 진로 검사 PDF를 읽고 통합적으로 해석합니다. 가능한 검사에는 커리어넷 진로흥미검사, 커리어넷 직업적성검사, 진로개발역량검사가 있습니다.",
  "세 검사가 모두 있으면 함께 연결해 분석하고, 한 개 또는 두 개의 검사만 있으면 업로드된 검사 결과만 근거로 분석합니다.",
  "업로드되지 않은 검사 결과는 추정하지 말고, 추가로 확인하면 좋은 질문이나 보완 자료로 안내합니다.",
  "검사 결과를 직업 하나로 단정하지 말고, 학생이 스스로 진로 탐색 계획을 세울 수 있도록 현실적인 활동 계획을 제안합니다.",
  "성적, 가정환경, 정신건강, 경제 상황 등 PDF에 명시되지 않은 민감한 개인정보는 추정하지 않습니다.",
  "학생에게 보여줄 상세 보고서, 구글 시트에 남길 300자 이내 요약, 도서 추천에 사용할 키워드와 알라딘 검색어를 구분해 작성합니다."
].join("\n");

const BOOK_SYSTEM_PROMPT = [
  "당신은 중학교 진로 독서 활동을 돕는 사서교사이자 진로전담교사입니다.",
  "학생의 진로 검사 통합 분석 결과를 바탕으로 진로 탐색에 도움이 되는 도서를 추천합니다.",
  "추천 도서는 반드시 제공된 알라딘 API 후보 목록 안에서만 고릅니다. 후보 목록에 없는 도서는 지어내지 않습니다.",
  "학생의 흥미, 적성, 진로개발역량, 탐색 주제와 연결되는 책을 우선합니다.",
  "특정 직업 하나로 학생을 단정하지 말고, 학생이 스스로 관심 분야를 넓히고 검증할 수 있는 책을 추천합니다.",
  "중학생이 읽기에 지나치게 어렵거나 전문적인 책은 피하고, 청소년 진로 독서에 적합한 책을 우선합니다.",
  "추천 이유는 학생에게 직접 말하듯 쉽고 구체적으로 2~4문장으로 작성합니다.",
  "가격, ISBN, 출판사, 출판연도 등 도서 메타데이터는 알라딘 API 후보 목록의 값을 그대로 사용합니다."
].join("\n");

export async function POST(request: Request) {
  try {
    const accessError = verifyAccessCode(request);
    if (accessError) return accessError;

    const body = await request.json();
    const student = normalizeStudent(body.student);
    const files = normalizeFiles(body.files);
    const finalBookCount = clampNumber(Number(body.finalBookCount || 5), 1, 20, 5);

    validateStudent(student);
    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: "진로 검사 PDF를 하나 이상 업로드하세요." }, { status: 400 });
    }

    const existing = await callSheetWebhook("checkStudent", { student }, false);
    if (existing?.analysisDone) {
      return NextResponse.json({ blocked: true, message: existing.analysisMessage || "이미 AI 분석을 완료했습니다." }, { status: 409 });
    }
    if (existing?.bookChoiceDone) {
      return NextResponse.json({ blocked: true, message: existing.bookChoiceMessage || "이미 도서 선택을 완료했습니다." }, { status: 409 });
    }

    const analysis = await requestCareerAnalysis(student, files);
    const candidates = await collectAladinCandidates(analysis, finalBookCount);
    const books = await requestBookSelection(student, analysis, candidates, finalBookCount);

    await callSheetWebhook("analysis", {
      student,
      analysis,
      fileNames: {
        interest: files.interest?.name || "",
        aptitude: files.aptitude?.name || "",
        competency: files.competency?.name || ""
      }
    }, false);

    return NextResponse.json({ student, analysis, books });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "진로 분석과 도서 추천 중 문제가 생겼습니다." },
      { status: 500 }
    );
  }
}

function normalizeStudent(value: any): StudentInfo {
  return {
    grade: clean(value?.grade),
    classNo: clean(value?.classNo),
    studentNo: clean(value?.studentNo),
    name: clean(value?.name)
  };
}

function normalizeFiles(value: any): Record<string, UploadedFile> {
  const result: Record<string, UploadedFile> = {};
  for (const test of TESTS) {
    const file = value?.[test.key];
    if (file?.dataUrl) {
      result[test.key] = {
        name: clean(file.name || test.fallbackName),
        mimeType: clean(file.mimeType || "application/pdf"),
        dataUrl: String(file.dataUrl)
      };
    }
  }
  return result;
}

function validateStudent(student: StudentInfo) {
  if (!student.grade || !student.classNo || !student.studentNo || !student.name) {
    throw new Error("학년, 반, 번호, 이름을 모두 입력하세요.");
  }
}

async function requestCareerAnalysis(student: StudentInfo, files: Record<string, UploadedFile>): Promise<CareerAnalysis> {
  const content: any[] = [{ type: "input_text", text: buildAnalysisInstruction(student, files) }];
  for (const test of TESTS) {
    const file = files[test.key];
    if (!file) continue;
    content.push({
      type: "input_file",
      filename: safeFileName(file.name || test.fallbackName),
      file_data: file.dataUrl
    });
  }

  const body = buildResponsesBody(ANALYSIS_SYSTEM_PROMPT, content, "career_three_tests_report", {
    type: "object",
    additionalProperties: false,
    properties: {
      summaryForSheet: { type: "string" },
      studentReportMarkdown: { type: "string" },
      recommendationDomains: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            reading: { type: "string" },
            keywords: { type: "array", items: { type: "string" } },
            bookTopics: { type: "array", items: { type: "string" } }
          },
          required: ["name", "reading", "keywords", "bookTopics"]
        }
      },
      recommendationQueries: { type: "array", items: { type: "string" } }
    },
    required: ["summaryForSheet", "studentReportMarkdown", "recommendationDomains", "recommendationQueries"]
  });

  return requestOpenAiJson(body);
}

function buildAnalysisInstruction(student: StudentInfo, files: Record<string, UploadedFile>) {
  const uploaded = TESTS.filter((test) => files[test.key]).map((test, index) => `${index + 1}. ${test.label}`);
  return [
    "다음 학생이 업로드한 진로 검사 PDF를 분석하세요.",
    "",
    "학생 정보:",
    `- 학년: ${student.grade}`,
    `- 반: ${student.classNo}`,
    `- 번호: ${student.studentNo}`,
    `- 이름: ${student.name}`,
    "",
    "업로드된 PDF:",
    uploaded.join("\n"),
    "",
    "분석 자료 사용 기준:",
    "1. 업로드된 검사 결과만 근거로 분석하세요.",
    "2. 업로드되지 않은 검사 결과는 추정하지 마세요.",
    "3. 일부 검사만 있는 경우, 분석의 한계와 추가 확인 질문을 학생 눈높이에 맞게 설명하세요.",
    "",
    "학생 보고서 구성:",
    "## 검사 결과 한눈에 보기",
    "## 공통적으로 드러나는 강점과 관심",
    "## 진로 방향과 탐색 주제",
    "## 추가 확인 질문",
    "## 4주 진로 탐색 계획",
    "## 학생에게 주는 마무리 조언",
    "",
    "도서 추천용 데이터 작성 기준:",
    "1. recommendationDomains는 업로드된 검사 결과에 맞춰 2~5개 영역으로 작성하세요.",
    "2. 각 영역의 keywords는 짧은 핵심어 2~5개로 작성하세요.",
    "3. 각 영역의 bookTopics는 알라딘 도서 검색에 사용할 수 있는 주제어 2~4개로 작성하세요.",
    "4. recommendationQueries는 알라딘 검색에 적합한 짧은 명사형 검색어 5~10개로 작성하세요.",
    "5. summaryForSheet는 300자 이내로 작성하세요."
  ].join("\n");
}

async function collectAladinCandidates(analysis: CareerAnalysis, finalBookCount: number) {
  if (!process.env.ALADIN_TTB_KEY) throw new Error("ALADIN_TTB_KEY가 설정되지 않았습니다.");
  const maxResults = clampNumber(finalBookCount * 3, 10, 30, 15);
  const queries = buildBookQueries(analysis);
  const seen = new Set<string>();
  const candidates: BookCandidate[] = [];

  for (const query of queries) {
    const found = await searchAladin(query, maxResults).catch(() => []);
    for (const book of found) {
      const key = book.isbn || book.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push(book);
      if (candidates.length >= MAX_BOOK_CANDIDATES_FOR_AI) return candidates;
    }
  }

  if (candidates.length === 0) throw new Error("알라딘 API에서 추천 후보 도서를 찾지 못했습니다.");
  return candidates;
}

function buildBookQueries(analysis: CareerAnalysis) {
  const queries: string[] = [];
  appendUnique(queries, analysis.recommendationQueries);
  for (const domain of analysis.recommendationDomains || []) {
    appendUnique(queries, domain.bookTopics);
    appendUnique(queries, domain.keywords);
    appendUnique(queries, getPresetQueries(domain.name, domain.keywords));
  }
  appendUnique(queries, ["청소년 진로", "청소년 베스트셀러", "강점 찾기", "자기주도 학습", "청소년 공감", "인문 베스트셀러"]);
  return queries.slice(0, 18);
}

function appendUnique(target: string[], values: string[] = []) {
  for (const value of values) {
    const text = clean(value);
    if (text && !target.includes(text)) target.push(text);
  }
}

function getPresetQueries(category: string, keywords: string[] = []) {
  const text = `${category} ${keywords.join(" ")}`;
  if (["감정", "공감", "소통", "표현", "관계"].some((word) => text.includes(word))) {
    return ["청소년 공감", "청소년 관계 대화", "자기표현 글쓰기", "감정 수업"];
  }
  if (["비판", "정리", "학습", "탐구", "분석"].some((word) => text.includes(word))) {
    return ["비판적 사고", "공부법 베스트셀러", "자기주도 학습", "청소년 인문"];
  }
  if (["꾸준", "관리", "실행", "역량", "준비", "계획"].some((word) => text.includes(word))) {
    return ["습관 베스트셀러", "자기관리", "프로젝트 학습", "진로탐색"];
  }
  if (["진로", "강점", "직업", "미래", "관심"].some((word) => text.includes(word))) {
    return ["청소년 진로 베스트셀러", "강점 찾기", "미래 직업", "진로탐색"];
  }
  return ["청소년 베스트셀러", "자기계발 청소년", "인문 베스트셀러"];
}

async function searchAladin(query: string, maxResults: number) {
  const salesPointBooks = await requestAladinSearch(query, "SalesPoint", maxResults);
  const recentSalesPointBooks = salesPointBooks.filter(isRecentBook);
  if (recentSalesPointBooks.length >= Math.min(3, maxResults)) return recentSalesPointBooks;
  const newestBooks = await requestAladinSearch(query, "PublishTime", maxResults).catch(() => []);
  return mergeBooks(recentSalesPointBooks, newestBooks, salesPointBooks);
}

async function requestAladinSearch(query: string, sort: "SalesPoint" | "PublishTime", maxResults: number) {
  const url = new URL("https://www.aladin.co.kr/ttb/api/ItemSearch.aspx");
  url.searchParams.set("ttbkey", process.env.ALADIN_TTB_KEY || "");
  url.searchParams.set("Query", query);
  url.searchParams.set("QueryType", "Keyword");
  url.searchParams.set("MaxResults", String(maxResults));
  url.searchParams.set("start", "1");
  url.searchParams.set("SearchTarget", "Book");
  url.searchParams.set("Sort", sort);
  url.searchParams.set("Cover", "Big");
  url.searchParams.set("output", "js");
  url.searchParams.set("Version", "20131101");

  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error("알라딘 API 요청에 실패했습니다.");
  const payload = await response.json();
  const items = Array.isArray(payload.item) ? payload.item : [];

  return items.filter(isTeenOrAdultBook).map(normalizeAladinBook);
}

function normalizeAladinBook(item: any): BookCandidate {
  const isbn = clean(item.isbn13 || item.isbn);
  const pubDate = clean(item.pubDate);
  return {
    title: clean(item.title),
    author: clean(item.author),
    publisher: clean(item.publisher),
    pubDate,
    pubYear: pubDate.slice(0, 4),
    priceStandard: Number(item.priceStandard || 0),
    priceSales: Number(item.priceSales || 0),
    isbn,
    cover: clean(item.cover),
    aladinLink: clean(item.link || "https://www.aladin.co.kr"),
    yes24Link: `https://www.yes24.com/Product/Search?domain=BOOK&query=${encodeURIComponent(isbn || item.title || "")}`,
    description: clean(item.description),
    categoryName: clean(item.categoryName),
    customerReviewRank: Number(item.customerReviewRank || 0)
  };
}

function isTeenOrAdultBook(item: any) {
  const text = `${item.title || ""} ${item.categoryName || ""}`.toLowerCase();
  return !["어린이", "유아", "아동", "초등", "초등학생", "그림책", "유치원"].some((word) => text.includes(word));
}

function isRecentBook(book: BookCandidate) {
  const year = Number(String(book.pubDate || "").slice(0, 4));
  return Number.isFinite(year) && year >= RECENT_YEAR_CUTOFF;
}

function mergeBooks(...groups: BookCandidate[][]) {
  const seen = new Set<string>();
  const merged: BookCandidate[] = [];
  for (const group of groups) {
    for (const book of group) {
      const key = book.isbn || book.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(book);
    }
  }
  return merged;
}

async function requestBookSelection(student: StudentInfo, analysis: CareerAnalysis, candidates: BookCandidate[], finalBookCount: number) {
  const compactCandidates = candidates.map((book, index) => ({ id: String(index + 1), ...book }));
  const body = buildResponsesBody(BOOK_SYSTEM_PROMPT, [{
    type: "input_text",
    text: [
      "다음 학생의 진로검사 통합 분석 결과와 알라딘 후보 도서 목록을 바탕으로 최종 추천 도서를 고르세요.",
      "",
      `학생: ${student.grade}학년 ${student.classNo}반 ${student.studentNo}번 ${student.name}`,
      `최종 추천 도서 개수: ${finalBookCount}`,
      "",
      "진로검사 통합 분석 요약:",
      analysis.summaryForSheet,
      "",
      "도서 추천 영역:",
      JSON.stringify(analysis.recommendationDomains || [], null, 2),
      "",
      "알라딘 후보 도서 목록:",
      JSON.stringify(compactCandidates, null, 2)
    ].join("\n")
  }], "career_book_recommendations", {
    type: "object",
    additionalProperties: false,
    properties: {
      books: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            author: { type: "string" },
            publisher: { type: "string" },
            pubYear: { type: "string" },
            priceStandard: { type: "number" },
            priceSales: { type: "number" },
            isbn: { type: "string" },
            cover: { type: "string" },
            aladinLink: { type: "string" },
            yes24Link: { type: "string" },
            reason: { type: "string" }
          },
          required: ["title", "author", "publisher", "pubYear", "priceStandard", "priceSales", "isbn", "cover", "aladinLink", "yes24Link", "reason"]
        }
      }
    },
    required: ["books"]
  });

  const selected = await requestOpenAiJson(body);
  return Array.isArray(selected.books) ? selected.books.slice(0, finalBookCount) : [];
}

function buildResponsesBody(systemPrompt: string, userContent: any[], schemaName: string, schema: any) {
  const body: any = {
    model: process.env.OPENAI_TEXT_MODEL || DEFAULT_MODEL,
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: userContent }
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    }
  };
  body.reasoning = { effort: process.env.OPENAI_REASONING || "medium" };
  return body;
}

async function requestOpenAiJson(body: any) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI API 오류(${response.status}): ${text}`);
  const parsed = JSON.parse(text);
  const outputText = parsed.output_text || (parsed.output || [])
    .flatMap((item: any) => item.content || [])
    .filter((content: any) => content.type === "output_text" && content.text)
    .map((content: any) => content.text)
    .join("\n");
  if (!outputText) throw new Error("OpenAI 응답에서 결과 텍스트를 찾지 못했습니다.");
  return JSON.parse(stripJsonFence(outputText));
}

async function callSheetWebhook(action: string, payload: Record<string, any>, required: boolean) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!webhookUrl) {
    if (required) throw new Error("GOOGLE_SHEET_WEBHOOK_URL이 설정되지 않았습니다.");
    return null;
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.APP_SECRET || "",
      action,
      createdAt: new Date().toISOString(),
      ...payload
    })
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.ok === false) {
    if (required) throw new Error(json.error || "구글시트 Webhook 요청이 실패했습니다.");
    return null;
  }
  return json;
}

function clean(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function safeFileName(value: string) {
  return String(value || "career-test.pdf").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

function stripJsonFence(text: string) {
  return String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
