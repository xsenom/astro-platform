export default function CoursesPage() {
    return (
        <div
            style={{
                display: "grid",
                gap: 18,
                minHeight: "70vh",
                alignContent: "center",
            }}
        >
            <div
                style={{
                    position: "relative",
                    overflow: "hidden",
                    padding: "28px 20px",
                    borderRadius: 28,
                    border: "1px solid rgba(224,197,143,.16)",
                    background:
                        "radial-gradient(circle at top, rgba(120,160,255,.18), transparent 40%), rgba(17,34,80,.18)",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        background:
                            "radial-gradient(circle, rgba(255,255,255,.9) 0 1px, transparent 1.5px) 0 0 / 72px 72px",
                        opacity: 0.16,
                    }}
                />

                <div style={{ position: "relative", display: "grid", gap: 18, justifyItems: "center" }}>
                    <AstroLoader />

                    <div style={{ textAlign: "center", display: "grid", gap: 10, maxWidth: 700 }}>
                        <div style={{ fontSize: 34, fontWeight: 950 }}>Курсы</div>
                        <div
                            style={{
                                fontSize: 18,
                                lineHeight: 1.7,
                                color: "rgba(245,240,233,.84)",
                            }}
                        >
                            Раздел в разработке.
                        </div>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gap: 10,
                            width: "100%",
                            maxWidth: 680,
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        }}
                    >
                        {[
                            "🪐 Программа \"Азбука астролога\"",
                            "❤️ Программа \"Время Любви\"",
                            "🙌 Программа \"Гороскоп здоровья\"",
                        ].map((item) => (
                            <div
                                key={item}
                                style={{
                                    padding: "14px 16px",
                                    borderRadius: 18,
                                    border: "1px solid rgba(224,197,143,.12)",
                                    background: "rgba(10,18,38,.18)",
                                    fontWeight: 800,
                                    textAlign: "center",
                                }}
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AstroLoader() {
    return (
        <div
            style={{
                position: "relative",
                width: 220,
                height: 220,
                display: "grid",
                placeItems: "center",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    width: 188,
                    height: 188,
                    borderRadius: "50%",
                    border: "1px dashed rgba(224,197,143,.30)",
                    animation: "spinOrbit 14s linear infinite",
                }}
            />
            <div
                style={{
                    position: "absolute",
                    width: 128,
                    height: 128,
                    borderRadius: "50%",
                    border: "1px dashed rgba(140,180,255,.30)",
                    animation: "spinOrbitReverse 10s linear infinite",
                }}
            />
            <div
                style={{
                    width: 74,
                    height: 74,
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle at 30% 30%, rgba(255,245,210,.96), rgba(224,197,143,.58))",
                    boxShadow: "0 0 50px rgba(224,197,143,.22)",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    width: 188,
                    height: 188,
                    animation: "spinOrbit 14s linear infinite",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: -6,
                        left: "50%",
                        marginLeft: -10,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "rgba(189,220,255,.92)",
                        boxShadow: "0 0 18px rgba(189,220,255,.32)",
                    }}
                />
            </div>

            <div
                style={{
                    position: "absolute",
                    width: 128,
                    height: 128,
                    animation: "spinOrbitReverse 10s linear infinite",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: -5,
                        left: "50%",
                        marginLeft: -7,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "rgba(214,244,157,.96)",
                        boxShadow: "0 0 18px rgba(214,244,157,.32)",
                    }}
                />
            </div>

            <style>{`
                @keyframes spinOrbit {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes spinOrbitReverse {
                    from { transform: rotate(360deg); }
                    to { transform: rotate(0deg); }
                }
            `}</style>
        </div>
    );
}
