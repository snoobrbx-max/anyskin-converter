import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AnySkin Converter", description: "Convert a Minecraft Java skin into a signed texture and an AnySkin command." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
