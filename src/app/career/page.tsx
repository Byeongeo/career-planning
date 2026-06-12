"use client";

import { useEffect, useMemo, useState } from "react";

type StudentInfo = {
  grade: string;
  classNo: string;
  studentNo: string;
  name: string;
};

type FilePayload = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

type RecommendedBook = {
  title: string;
  author: string;
  publisher: string;
  pubYear: string;
  priceStandard: number;
  priceSales: number;
  isbn: string;
  cover: string;
  aladinLink: string;
  yes24Link: string;
  reason: string;
};

type AnalyzePayload = {
  analysis: {
    summaryForSheet: string;
    studentReportMarkdown: string;
  };
  books: RecommendedBook[];
};

const emptyStudent: StudentInfo = {
  grade: "",
  classNo: "",
  studentNo: "",
  name: ""
};

export default function CareerPage() {
  const [student, setStudent] = useState<StudentInfo>(emptyStudent);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [finalBookCount, setFinalBookCount] = useState(5);
  const [result, setResult] = useState<AnalyzePayload | null>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "ok" | "warn">("ok");
  const [accessCodeRequired, setAccessCodeRequired] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [selectedIsbn, setSelectedIsbn] = useState("");

  const canAnalyze = useMemo(() => {
    const hasStudent = Boolean(student.grade && student.classNo && student.studentNo && student.name);
    const hasFile = Boolean(files.interest || files.aptitude || files.competency);
    return hasStudent && hasFile && !busy;
  }, [busy, files, student]);

  useEffect(() => {
    const savedCode = window.sessionStorage.getItem("career-app-access-code") || "";
    setAccessCode(savedCode);
    fetch("/api/config")
      .then((response) => response.json())
      .then((config) => {
        const required = Boolean(config.accessCodeRequired);
        setAccessCodeRequired(required);
        setAccessGranted(!required || Boolean(savedCode));
      })
      .catch(() => setAccessGranted(true));
  }, []);

  useEffect(() => {
    if (!busy) {
      setProgress(0);
      return;
    }
    setProgress(8);
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        if (current < 45) return current + 6;
        if (current < 75) return current + 4;
        return current + 2;
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [busy]);

  function unlockApp() {
    const trimmed = accessCode.trim();
    if (!trimmed) {
      showMessage("접속 코드를 입력하세요.", "error");
      return;
    }
    window.sessionStorage.setItem("career-app-access-code", trimmed);
    setAccessCode(trimmed);
    setAccessGranted(true);
    setMessage("");
  }

  async function analyzeCareer() {
    if (!canAnalyze) return;
    setBusy("AI가 진로 검사와 도서 후보를 분석하고 있습니다.");
    setMessage("");
    setSelectedIsbn("");
    try {
      const filePayloads = await readSelectedFiles(files);
      const response = await fetch("/api/career/analyze", {
        method: "POST",
        headers: makeHeaders(accessCode),
        body: JSON.stringify({ student, files: filePayloads, finalBookCount })
      });
      const payload = await response.json();
      if (response.status === 409) {
        showMessage(payload.message || "이미 진행한 학생입니다.", "warn");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "분석에 실패했습니다.");
      setProgress(100);
      setResult(payload);
      showMessage("AI 분석과 도서 추천이 완료되었습니다.", "ok");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "분석 중 문제가 생겼습니다.", "error");
    } finally {
      setBusy("");
    }
  }

  async function chooseBook(book: RecommendedBook) {
    setBusy("도서 선택을 구글시트에 저장하고 있습니다.");
    setMessage("");
    try {
      const response = await fetch("/api/career/save-book-choice", {
        method: "POST",
        headers: makeHeaders(accessCode),
        body: JSON.stringify({ student, book })
      });
      const payload = await response.json();
      if (response.status === 409) {
        showMessage(payload.message || "이미 도서 선택을 완료했습니다.", "warn");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "도서 선택 저장에 실패했습니다.");
      setSelectedIsbn(book.isbn);
      showMessage(payload.message || "도서 선택이 저장되었습니다.", "ok");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "도서 선택 저장 중 문제가 생겼습니다.";
      showMessage(
        detail.includes("GOOGLE_SHEET_WEBHOOK_URL")
          ? "구글시트 웹훅 연결이 아직 설정되지 않았습니다. Vercel 환경 변수 GOOGLE_SHEET_WEBHOOK_URL과 APP_SECRET을 확인하세요."
          : detail,
        "error"
      );
    } finally {
      setBusy("");
    }
  }

  function showMessage(text: string, type: "error" | "ok" | "warn") {
    setMessage(text);
    setMessageType(type);
  }

  return (
    <main className="app-shell career-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">進</div>
          <div>
            <h1 className="brand-title">진로 검사 기반 도서 추천</h1>
            <p className="brand-subtitle">Vercel에서 AI 분석을 처리하고, 구글시트에는 결과만 저장합니다.</p>
          </div>
        </div>
        {busy ? <div className="status-pill">{busy}</div> : null}
      </header>

      {busy ? (
        <section className="progress-panel" aria-live="polite">
          <div className="progress-copy">
            <strong>{busy}</strong>
            <span>{progress < 100 ? "잠시만 기다려 주세요." : "완료되었습니다."}</span>
          </div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </section>
      ) : null}

      {accessCodeRequired && !accessGranted ? (
        <section className="access-panel">
          <div>
            <h2>접속 코드 입력</h2>
            <p>교사가 안내한 접속 코드를 입력한 뒤 사용할 수 있습니다.</p>
          </div>
          <div className="access-form">
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") unlockApp();
              }}
              placeholder="접속 코드"
              type="password"
            />
            <button className="button" onClick={unlockApp}>입장</button>
          </div>
        </section>
      ) : null}

      <section className="main-grid" hidden={accessCodeRequired && !accessGranted}>
        <aside className="panel">
          <div className="panel-inner">
            <h2 className="section-title">학생 정보</h2>
            <div className="form-grid">
              <Field label="학년" value={student.grade} onChange={(grade) => setStudent({ ...student, grade })} />
              <Field label="반" value={student.classNo} onChange={(classNo) => setStudent({ ...student, classNo })} />
              <Field label="번호" value={student.studentNo} onChange={(studentNo) => setStudent({ ...student, studentNo })} />
              <Field label="이름" value={student.name} onChange={(name) => setStudent({ ...student, name })} />
              <label className="field full">
                <span>최종 추천 도서 개수</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={finalBookCount}
                  onChange={(event) => setFinalBookCount(clampNumber(Number(event.target.value), 1, 20, 5))}
                />
              </label>
            </div>
            <div className="notice">같은 학생은 AI 분석 1회, 도서 선택 1회만 할 수 있습니다.</div>
          </div>
        </aside>

        <section className="panel">
          <div className="panel-inner">
            <h2 className="section-title">진로 검사 PDF 업로드</h2>
            <div className="career-file-grid">
              <FileBox label="커리어넷 진로흥미검사 PDF" onChange={(file) => setFiles({ ...files, interest: file })} />
              <FileBox label="커리어넷 직업적성검사 PDF" onChange={(file) => setFiles({ ...files, aptitude: file })} />
              <FileBox label="진로개발역량검사 PDF" onChange={(file) => setFiles({ ...files, competency: file })} />
            </div>
            <div className="actions">
              <button className="button" onClick={analyzeCareer} disabled={!canAnalyze}>AI 분석 및 도서 추천</button>
            </div>
          </div>
        </section>
      </section>

      {message ? <div className={`career-message ${messageType}`}>{message}</div> : null}

      {result ? (
        <section className="career-output">
          <section className="panel">
            <div className="panel-inner">
              <h2 className="section-title">AI 분석 보고서</h2>
              <article className="career-report" dangerouslySetInnerHTML={{ __html: markdownToHtml(result.analysis.studentReportMarkdown) }} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-inner">
              <h2 className="section-title">추천 도서</h2>
              <div className="career-book-grid">
                {result.books.map((book) => (
                  <article className={`career-book-card ${selectedIsbn === book.isbn ? "selected" : ""}`} key={book.isbn || book.title}>
                    {book.cover ? (
                      <img
                        src={book.cover}
                        alt=""
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                    ) : null}
                    <div>
                      <h3>{book.title}</h3>
                      <p className="book-meta">{[book.author, book.publisher, book.pubYear].filter(Boolean).join(" · ")}</p>
                      <p className="book-meta">정가 {formatWon(book.priceStandard)} / 판매가 {formatWon(book.priceSales)}</p>
                      <p className="book-meta">ISBN {book.isbn}</p>
                      <p>{book.reason}</p>
                      <div className="book-links">
                        <a className="link-button" href={book.aladinLink} target="_blank" rel="noreferrer">알라딘 보기</a>
                        <a className="link-button light" href={book.yes24Link} target="_blank" rel="noreferrer">예스24 보기</a>
                        <button className="button" onClick={() => chooseBook(book)} disabled={Boolean(busy) || selectedIsbn === book.isbn}>
                          {selectedIsbn === book.isbn ? "선택 완료" : "이 책으로 선택"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FileBox({ label, onChange }: { label: string; onChange: (file: File | undefined) => void }) {
  return (
    <label className="career-file-box">
      <span>{label}</span>
      <input type="file" accept="application/pdf,.pdf" onChange={(event) => onChange(event.target.files?.[0])} />
    </label>
  );
}

async function readSelectedFiles(files: Record<string, File | undefined>) {
  const entries = await Promise.all(
    Object.entries(files)
      .filter(([, file]) => Boolean(file))
      .map(async ([key, file]) => [key, await readFileAsPayload(file as File)] as const)
  );
  return Object.fromEntries(entries);
}

function readFileAsPayload(file: File): Promise<FilePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type || "application/pdf", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽는 중 문제가 발생했습니다.`));
    reader.readAsDataURL(file);
  });
}

function makeHeaders(accessCode: string) {
  return {
    "Content-Type": "application/json",
    "x-app-access-code": accessCode
  };
}

function markdownToHtml(markdown: string) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => {
      const text = line.trim();
      if (!text) return "";
      if (text.startsWith("### ")) return `<h3>${escapeHtml(text.slice(4))}</h3>`;
      if (text.startsWith("## ")) return `<h2>${escapeHtml(text.slice(3))}</h2>`;
      if (/^[-*]\s+/.test(text)) return `<p>• ${escapeHtml(text.replace(/^[-*]\s+/, ""))}</p>`;
      return `<p>${escapeHtml(text)}</p>`;
    })
    .join("");
}

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatWon(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
