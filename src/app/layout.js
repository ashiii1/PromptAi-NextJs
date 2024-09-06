import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Kyra AI",
  description: "An AI-powered marketing assistant",
};

export default function RootLayout({ children }) {
  console.log("Layout is rendering");
  return (
    <html lang="en">
      <head>
        <title>{metadata.title}</title>
        <meta name="description" content={metadata.description} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}