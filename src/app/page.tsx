import Link from "next/link";

export default function Home() {
  return (
    <main className="app-shell">
      <section className="panel">
        <div className="panel-inner">
          <h1 className="brand-title">진로 검사 기반 도서 추천</h1>
          <p className="brand-subtitle">
            진로 검사 PDF를 업로드해 AI 분석과 추천 도서를 확인합니다.
          </p>
          <div className="actions">
            <Link className="link-button" href="/career">
              진로 도서 추천 시작
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
