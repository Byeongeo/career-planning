import { NextResponse } from "next/server";

export function verifyAccessCode(request: Request) {
  const expectedCode = process.env.APP_ACCESS_CODE;
  if (!expectedCode) return null;

  const providedCode = request.headers.get("x-app-access-code") || "";
  if (providedCode === expectedCode) return null;

  return NextResponse.json(
    { error: "접속 코드가 맞지 않습니다. 교사에게 받은 접속 코드를 입력하세요." },
    { status: 401 }
  );
}
