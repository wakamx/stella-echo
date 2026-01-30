import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'STELLA ECHO',
  description: 'Record your energy in the stars.',
};

// ▼▼▼ ここを追加・修正（スマホのバーの色設定） ▼▼▼
export const viewport: Viewport = {
  themeColor: '#020617', // 背景色と同じslate-950
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};
// ▲▲▲▲▲▲

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-slate-950 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}