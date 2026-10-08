import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "save siri | จัดการการเงิน",
  description: "จัดการรายรับรายจ่าย วิเคราะห์การเงิน และวางแผนการออม",
  applicationName: "save siri",
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "save siri" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
