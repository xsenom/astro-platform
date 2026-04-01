import type { Metadata } from "next";
import "./globals.css";
import AstroBackdrop from "@/components/astro/AstroBackdrop";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
    title: "Личностно ориентированная астрология",
    description: "Личностно ориентированная астрология",
    icons: {
        icon: "/favicon.ico",
        shortcut: "/favicon.ico",
        apple: "/favicon.ico",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru">
            <body>
                <AstroBackdrop />
                <div className="appLayer">
                    <div className="pageFrame">{children}</div>
                    <SiteFooter />
                </div>
            </body>
        </html>
    );
}