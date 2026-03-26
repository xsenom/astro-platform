import "./globals.css";
import AstroBackdrop from "@/components/astro/AstroBackdrop";
import SiteFooter from "@/components/SiteFooter";

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
