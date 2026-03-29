"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function UranVBliznetsahEntryPage() {
  const [status, setStatus] = useState("Проверяем доступ к личному кабинету…");

  useEffect(() => {
    let active = true;

    async function go() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        setStatus("Перенаправляем на вход/регистрацию…");
        window.location.href = "/login";
        return;
      }

      setStatus("Открываем расчёт «Уран в Близнецах»…");
      window.location.href = "/cabinet/calculations?calc=uranus_gemini";
    }

    void go();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ minHeight: "45vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", color: "rgba(245,240,233,.92)", fontSize: 18, fontWeight: 700 }}>
        {status}
      </div>
    </main>
  );
}
