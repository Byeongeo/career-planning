import { NextResponse } from "next/server";
import { verifyAccessCode } from "@/lib/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const accessError = verifyAccessCode(request);
    if (accessError) return accessError;

    const body = await request.json();
    const student = normalizeStudent(body.student);
    const book = normalizeBook(body.book);
    validateStudent(student);
    validateBook(book);

    const existing = await callSheetWebhook("checkStudent", { student }, false);
    if (existing?.bookChoiceDone) {
      return NextResponse.json(
        { blocked: true, message: existing.bookChoiceMessage || "이미 도서 선택을 완료했습니다." },
        { status: 409 }
      );
    }

    const saved = await callSheetWebhook("bookChoice", { student, book }, true);
    if (saved?.blocked) {
      return NextResponse.json({ blocked: true, message: saved.message || "이미 도서 선택을 완료했습니다." }, { status: 409 });
    }

    return NextResponse.json({ saved: true, message: "도서 선택이 구글시트에 저장되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { saved: false, error: error instanceof Error ? error.message : "도서 선택 저장 중 문제가 생겼습니다." },
      { status: 500 }
    );
  }
}

function normalizeStudent(value: any) {
  return {
    grade: clean(value?.grade),
    classNo: clean(value?.classNo),
    studentNo: clean(value?.studentNo),
    name: clean(value?.name)
  };
}

function normalizeBook(value: any) {
  return {
    title: clean(value?.title),
    author: clean(value?.author),
    publisher: clean(value?.publisher),
    pubYear: clean(value?.pubYear),
    priceStandard: Number(value?.priceStandard || 0),
    priceSales: Number(value?.priceSales || 0),
    isbn: clean(value?.isbn)
  };
}

function validateStudent(student: ReturnType<typeof normalizeStudent>) {
  if (!student.grade || !student.classNo || !student.studentNo || !student.name) {
    throw new Error("학년, 반, 번호, 이름을 모두 입력하세요.");
  }
}

function validateBook(book: ReturnType<typeof normalizeBook>) {
  if (!book.title || !book.author || !book.publisher || !book.isbn) {
    throw new Error("선택한 도서 정보가 부족합니다.");
  }
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
