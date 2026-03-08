import "./globals.css";
import AstroBackdrop from "@/components/astro/AstroBackdrop";

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru">
        <body>
        <AstroBackdrop />
        <div className="appLayer">{children}</div>
        </body>
        </html>
    );
}
