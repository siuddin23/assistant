import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Glowlab Dashboard", description: "Order, pengiriman, COD, dan performa tim" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
