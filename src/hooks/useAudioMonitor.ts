'use client';

import { useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useWakeLock } from './useWakeLock';

interface UseAudioMonitorOptions {
    isGuest: boolean;
    onData: (avg: number) => void;
    onFlushCheck: () => boolean;
    onFlush: () => void;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function useAudioMonitor({ isGuest, onData, onFlushCheck, onFlush, showToast }: UseAudioMonitorOptions) {
    const [volume, setVolume] = useState(0);
    const [isActive, setIsActive] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const { requestWakeLock, releaseWakeLock } = useWakeLock();

    const cleanup = useCallback(() => {
        releaseWakeLock();
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        setVolume(0);
    }, [releaseWakeLock]);

    const monitor = useCallback(() => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

        const update = async () => {
            if (!analyserRef.current) return;

            if (audioContextRef.current?.state === 'suspended') {
                try {
                    await audioContextRef.current.resume();
                } catch (e) {
                    console.error("Audio resume failed", e);
                }
            }

            analyserRef.current.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            setVolume(avg);
            onData(avg);

            if (onFlushCheck()) {
                onFlush();
            }
            animationFrameRef.current = requestAnimationFrame(update);
        };
        update();
    }, [onData, onFlushCheck, onFlush]);

    const startMonitoring = useCallback(async () => {
        try {
            if (!isGuest) {
                await supabase.auth.getSession();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            audioContextRef.current = new AudioContext();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            const source = audioContextRef.current.createMediaStreamSource(stream);
            source.connect(analyserRef.current);
            await requestWakeLock();
            setIsActive(true);
            monitor();
        } catch (err) {
            console.error(err);
            showToast("マイクの使用を許可してください。または他のアプリがマイクを使用中の可能性があります。", 'error');
        }
    }, [isGuest, requestWakeLock, monitor, showToast]);

    const stopMonitoring = useCallback(() => {
        cleanup();
        onFlush(); // 残データ保存
        setIsActive(false);
    }, [cleanup, onFlush]);

    return { volume, isActive, startMonitoring, stopMonitoring };
}
