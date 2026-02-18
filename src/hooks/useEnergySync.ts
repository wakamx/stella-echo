'use client';

import { useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface EnergyLog {
    id: string;
    intensity_db: number;
    created_at: string;
}

interface UseSyncOptions {
    user: User | null;
    isGuest: boolean;
    setTotalEnergy: React.Dispatch<React.SetStateAction<number>>;
    setHistory: React.Dispatch<React.SetStateAction<EnergyLog[]>>;
    onLaunch: () => void;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function useEnergySync({ user, isGuest, setTotalEnergy, setHistory, onLaunch, showToast }: UseSyncOptions) {
    const recordingRef = useRef<{ history: number[]; startTime: number }>({ history: [], startTime: 0 });

    const resetRecording = useCallback(() => {
        recordingRef.current = { history: [], startTime: Date.now() };
    }, []);

    const pushVolume = useCallback((avg: number) => {
        recordingRef.current.history.push(avg);
    }, []);

    const shouldFlush = useCallback(() => {
        return Date.now() - recordingRef.current.startTime > 15000;
    }, []);

    const saveRecordingData = useCallback(() => {
        const now = Date.now();
        const currentHistory = [...recordingRef.current.history];
        const currentStartTime = recordingRef.current.startTime;

        // バッファを即座にリセット
        recordingRef.current.history = [];
        recordingRef.current.startTime = now;

        if (currentHistory.length === 0) return;

        const duration = (now - currentStartTime) / 1000;
        if (duration < 1) return;

        const averageVolume = currentHistory.reduce((a, b) => a + b) / currentHistory.length;

        // UI更新（即時反映）
        setTotalEnergy(prev => prev + Math.round(averageVolume));
        onLaunch();

        // サーバー送信処理（Fire and forget）
        if (!isGuest && user) {
            (async () => {
                try {
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                        console.warn("Offline: Skipping sync");
                        return;
                    }

                    const insertData = {
                        intensity_db: Math.round(averageVolume * 10) / 10,
                        duration_sec: Math.round(duration),
                    };

                    let { data, error } = await supabase.from('energy_logs').insert([insertData]).select().single();

                    if (error) {
                        console.error("Sync failed:", error.message);
                        if (error.code === 'PGRST301' || error.message.includes("JWT") || (error as any).status === 401) {
                            console.log("Attempting session refresh...");
                            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                            if (!refreshError && refreshData.session) {
                                const retry = await supabase.from('energy_logs').insert([insertData]).select().single();
                                data = retry.data;
                                error = retry.error;
                            }
                        }
                    }

                    if (!error && data) {
                        setHistory(prev => [data, ...prev]);
                    }
                } catch (err) {
                    console.error("Unexpected sync error:", err);
                }
            })();
        }
    }, [user, isGuest, setTotalEnergy, setHistory, onLaunch, showToast]);

    return { resetRecording, pushVolume, shouldFlush, saveRecordingData };
}
