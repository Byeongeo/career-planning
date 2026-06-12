import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "손금 도서 추천 앱",
  description: "카메라 촬영, AI 손금 인포그래픽, 알라딘 도서 추천을 연결한 수업용 Vercel 앱"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
