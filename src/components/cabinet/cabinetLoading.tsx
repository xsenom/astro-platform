"use client";

import React, { createContext, useContext, useMemo, useRef, useState } from "react";

type DoneFn = () => void;
type LoadingOptions = {
    message?: string;
};

type CabinetLoadingCtx = {
    // основной флаг (показывать луну/оверлей)
    loading: boolean;
    message: string;

    // start возвращает done(), чтобы можно было делать:
    // const done = startLoading(); ... done();
    start: (options?: LoadingOptions) => DoneFn;
    startLoading: (options?: LoadingOptions) => DoneFn;

    // совместимость: можно напрямую стопать
    stop: () => void;
    stopLoading: () => void;
};

const DEFAULT_MESSAGE = "Загружаем данные";
type LoadingEntry = { id: number; message: string };

const CabinetLoadingContext = createContext<CabinetLoadingCtx | null>(null);

export function CabinetLoadingProvider({ children }: { children: React.ReactNode }) {
    const [entries, setEntries] = useState<LoadingEntry[]>([]);
    const nextIdRef = useRef(0);

    const value = useMemo<CabinetLoadingCtx>(() => {
        const stop = () => setEntries((current) => current.slice(0, -1));

        const start = (options?: LoadingOptions): DoneFn => {
            let finished = false;
            const id = nextIdRef.current++;
            const message = options?.message?.trim() || DEFAULT_MESSAGE;

            setEntries((current) => [...current, { id, message }]);

            return () => {
                if (finished) return;
                finished = true;
                setEntries((current) => current.filter((entry) => entry.id !== id));
            };
        };

        return {
            loading: entries.length > 0,
            message: entries.at(-1)?.message || DEFAULT_MESSAGE,
            start,
            startLoading: start,
            stop,
            stopLoading: stop,
        };
    }, [entries]);

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
            message: DEFAULT_MESSAGE,
            start,
            startLoading: start,
            stop: () => {},
            stopLoading: () => {},
        };
    }

    return ctx;
}
