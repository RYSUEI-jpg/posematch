import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "ポーズマスターAI - AIがあなたのポーズを採点！";
const DESCRIPTION =
  "お手本のポーズをマネしてカメラに写すと、AIが一致度を採点するゲーム。スマホでQRを読んで今すぐ遊べる！";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "ポーズマスターAI",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b1020",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
