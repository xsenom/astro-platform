"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import MoonRouteTransition from "@/components/MoonRouteTransition";
import { CabinetLoadingProvider, useCabinetLoading } from "@/components/cabinet/cabinetLoading";


const NAV = [
    { href: "/cabinet", label: "Дашборд" },
    { href: "/cabinet/calculations", label: "Расчёты" },
    { href: "/cabinet/purchases", label: "Покупки" },
    { href: "/cabinet/profile", label: "Профиль" },
    { href: "/cabinet/support", label: "Поддержка" },
    { href: "/cabinet/admin", label: "Админ" },
];

function Shell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { loading, startLoading } = useCabinetLoading();

    async function signOut() {
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    return (
        <div style={{ minHeight: "100vh" }}>
            <header
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 20,
                    backdropFilter: "blur(14px)",
                    WebkitBackdropFilter: "blur(14px)",
                    background: "rgba(10, 18, 38, 0.55)",
                    borderBottom: "1px solid rgba(224,197,143,.16)",
                }}
            >
                <div
                    style={{
                        maxWidth: 1200,
                        margin: "0 auto",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        justifyContent: "space-between",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Личный кабинет</div>
                    </div>

                    <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                        {NAV.map((item) => {
                            const active = pathname === item.href || (item.href !== "/cabinet" && pathname.startsWith(item.href));

                            return (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    onClick={(e) => {
                                        // чтобы не запускать лишний раз
                                        if (active) return;

                                        e.preventDefault();
                                        startLoading();
                                        router.push(item.href);
                                    }}
                                    style={{
                                        textDecoration: "none",
                                        fontWeight: 850,
                                        fontSize: 14,
                                        padding: "8px 12px",
                                        borderRadius: 999,
                                        border: active ? "1px solid rgba(224,197,143,.30)" : "1px solid rgba(224,197,143,.12)",
                                        background: active ? "rgba(224,197,143,.10)" : "rgba(17,34,80,.16)",
                                        color: "rgba(245,240,233,.92)",
                                    }}
                                >
                                    {item.label}
                                </a>
                            );
                        })}
                    </nav>

                    <button
                        onClick={signOut}
                        style={{
                            borderRadius: 999,
                            padding: "8px 12px",
                            border: "1px solid rgba(224,197,143,.18)",
                            background: "rgba(17,34,80,.16)",
                            color: "rgba(245,240,233,.92)",
                            fontWeight: 900,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Выйти
                    </button>
                </div>
            </header>

            {/* ✅ Луна крутится пока loading=true */}
            <MoonRouteTransition show={loading} />

            <main style={{ maxWidth: 1200, margin: "0 auto", padding: "18px 16px" }}>{children}</main>
        </div>
    );
}

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
    return (
        <CabinetLoadingProvider>
            <Shell>{children}</Shell>
        </CabinetLoadingProvider>
    );
}
