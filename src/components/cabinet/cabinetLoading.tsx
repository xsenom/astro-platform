"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type DoneFn = () => void;

type CabinetLoadingCtx = {
    // основной флаг (показывать луну/оверлей)
    loading: boolean;

    // start возвращает done(), чтобы можно было делать:
    // const done = startLoading(); ... done();
    start: () => DoneFn;
    startLoading: () => DoneFn;

    // совместимость: можно напрямую стопать
    stop: () => void;
    stopLoading: () => void;
};

const CabinetLoadingContext = createContext<CabinetLoadingCtx | null>(null);

export function CabinetLoadingProvider({ children }: { children: React.ReactNode }) {
    // счётчик активных загрузок (важно для параллельных запросов)
    const [count, setCount] = useState(0);

    const value = useMemo<CabinetLoadingCtx>(() => {
        const stop = () => setCount((c) => Math.max(0, c - 1));

        const start = (): DoneFn => {
            let finished = false;
            setCount((c) => c + 1);

            // done() можно вызвать один раз
            return () => {
                if (finished) return;
                finished = true;
                stop();
            };
        };

        return {
            loading: count > 0,
            start,
            startLoading: start,
            stop,
            stopLoading: stop,
        };
    }, [count]);

    return <CabinetLoadingContext.Provider value={value}>{children}</CabinetLoadingContext.Provider>;
}

export function useCabinetLoading(): CabinetLoadingCtx {
    const ctx = useContext(CabinetLoadingContext);

    // безопасный fallback, чтобы не падало, если Provider не обернул
    if (!ctx) {
        const noopDone = () => {};
        const start = () => noopDone;

        return {
            loading: false,
            start,
            startLoading: start,
            stop: () => {},
            stopLoading: () => {},
        };
    }

    return ctx;
}
