import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YDown",
  description: "내 PC로 보내는 YouTube 다운로드 작업함",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
