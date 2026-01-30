'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Ranking from './components/Ranking';
import ProfileSettings from './components/ProfileSettings';

interface EnergyLog {
  id: string;
  intensity_db: number;
  created_at: string;
}

interface Profile {
  nickname: string;
  birthday: string;
}

export default function NightSky() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<'home' | 'dashboard' | 'ranking' | 'settings'>('home'); 
  const [isGuest, setIsGuest] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [totalEnergy, setTotalEnergy] = useState(0);
  const [isLaunching, setIsLaunching] = useState(false);
  const [history, setHistory] = useState<EnergyLog[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // Wake Lockの状態管理用
  const wakeLockRef = useRef<any>(null);

  const calculateMonthlyAge = (birthdayStr: string) => {
    if (!birthdayStr) return 0;
    const birth = new Date(birthdayStr);
    const now = new Date(); 
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    return months < 0 ? 0 : months;
  };

  // 画面スリープ防止の要求
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.error("Wake Lock 失敗:", err);
    }
  };

  // スリープ防止の解除
  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const cleanup = () => {
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
  };

  const stopMonitoring = () => {
    cleanup();
    setIsActive(false);
  };

  const fetchPastData = async (userId: string) => {
    const { data: profileData } = await supabase.from('profiles').select('nickname, birthday').eq('id', userId).single();
    if (profileData) setProfile(profileData);

    const { data: allData } = await supabase.from('energy_logs').select('intensity_db').eq('user_id', userId);
    if (allData) {
      setTotalEnergy(Math.round(allData.reduce((acc, row) => acc + row.intensity_db, 0)));
    }

    const { data: allLogs } = await supabase.from('energy_logs').select('id, intensity_db, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (allLogs) setHistory(allLogs);
  };

  const handleUserChange = async (currentUser: User | null) => {
    setUser(currentUser);
    if (currentUser) {
      setIsGuest(false);
      await fetchPastData(currentUser.id);
    } else {
      setTotalEnergy(0); setHistory([]); setProfile(null); setView('home');
    }
  };

  const monitor = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    let lastSavedTime = Date.now();
    let volumeHistory: number[] = [];

    const update = async () => {
      if (!analyserRef.current) return;

      // スマホのスリープ復帰時にAudioContextがSuspendedになる対策
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      analyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setVolume(avg);
      volumeHistory.push(avg);

      const now = Date.now();
      if (now - lastSavedTime > 60000 && volumeHistory.length > 0) {
        const averageVolume = volumeHistory.reduce((a, b) => a + b) / volumeHistory.length;
        
        if (!isGuest && user) {
          const { data, error } = await supabase.from('energy_logs').insert([
            { intensity_db: Math.round(averageVolume * 10) / 10, duration_sec: 60 }
          ]).select().single();
          
          if (error) console.error("同期失敗:", error.message);
          if (!error && data) setHistory(prev => [data, ...prev]);
        }

        setTotalEnergy(prev => prev + Math.round(averageVolume));
        setIsLaunching(true);
        volumeHistory = [];
        lastSavedTime = now;
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // 航海開始時にスリープ防止を有効化
      await requestWakeLock();
      
      setIsActive(true);
      monitor();
    } catch (err) {
      alert("マイクの使用を許可してください。スマホの設定からブラウザのマイク権限を確認してください。");
    }
  };

  const handleLogoutAction = async () => {
    stopMonitoring();
    await supabase.auth.signOut();
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => handleUserChange(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => handleUserChange(session?.user ?? null));
    
    // アプリがバックグラウンドから戻ったときにWake Lockを再要求する
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanup();
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 overflow-hidden relative font-sans">
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_50%,_var(--tw-gradient-stops))] from-blue-900 via-transparent to-transparent" />

      {/* 演出とナビゲーション（中略、以前のコードと同じ） */}
      <AnimatePresence>
        {isLaunching && (
          <motion.div
            initial={{ opacity: 0, y: 0, scale: 0.5, x: '-50%' }}
            animate={{ opacity: [0, 1, 1, 0], y: -800, scaleY: [1, 3, 1], filter: ["brightness(1)", "brightness(3)", "brightness(1)"] }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setIsLaunching(false)}
            className="absolute left-1/2 bottom-1/2 z-0 w-4 h-16 bg-blue-100 rounded-full shadow-[0_0_30px_10px_rgba(147,197,253,0.6)]"
            style={{ transformOrigin: 'bottom center' }}
          />
        )}
      </AnimatePresence>

      {(user || isGuest) && (
        <div className="fixed top-6 left-6 right-6 flex justify-between items-center z-50">
          <button onClick={() => !isGuest && setView('settings')} className="flex flex-col text-left group transition-opacity">
            <span className="text-blue-100 text-[12px] tracking-[0.1em] font-light group-hover:text-blue-400">
              {isGuest ? "GUEST MODE" : (profile?.nickname || "VOYAGER")}
            </span>
            {!isGuest && profile?.birthday && (
              <span className="text-blue-400/60 text-[9px] tracking-widest uppercase mt-0.5">
                生後 {calculateMonthlyAge(profile.birthday)} ヶ月 <span className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">EDIT</span>
              </span>
            )}
          </button>
          <div className="flex items-center gap-4">
            {!isGuest && (
              <>
                <button onClick={() => setView('ranking')} className={`text-[9px] tracking-widest transition-colors ${view === 'ranking' ? 'text-blue-400' : 'text-slate-500 hover:text-blue-200'}`}>RANKING</button>
                <button onClick={() => setView('dashboard')} className={`text-[9px] tracking-widest transition-colors ${view === 'dashboard' ? 'text-blue-400' : 'text-slate-500 hover:text-blue-200'}`}>DASHBOARD</button>
              </>
            )}
            <button onClick={isGuest ? () => setIsGuest(false) : handleLogoutAction} className="text-slate-500 text-[9px] tracking-widest hover:text-red-400 px-3 py-1 bg-slate-900/40 rounded-full border border-white/5">
              {isGuest ? "EXIT" : "LOGOUT"}
            </button>
          </div>
        </div>
      )}

      <div className="relative flex flex-col items-center justify-center z-10 w-full max-w-md px-6">
        {!user && !isGuest ? (
          <div className="flex flex-col items-center gap-8 w-full mt-[-5vh]">
            <h1 className="text-blue-100 text-3xl font-extralight tracking-[0.3em] mb-4">STELLA ECHO</h1>
            <Auth />
            <button onClick={() => setIsGuest(true)} className="text-blue-400/60 text-[10px] tracking-widest underline underline-offset-8 decoration-blue-900/50 hover:text-blue-300 transition-colors">GUEST MODE</button>
          </div>
        ) : view === 'settings' && profile ? (
          <ProfileSettings initialData={profile} onBack={() => setView('home')} onUpdate={() => fetchPastData(user!.id)} />
        ) : view === 'ranking' && !isGuest ? (
          <Ranking monthlyAge={calculateMonthlyAge(profile?.birthday || "")} onBack={() => setView('home')} />
        ) : view === 'dashboard' ? (
          <Dashboard logs={history} onBack={() => setView('home')} />
        ) : (
          <div className="text-center">
            <motion.div animate={{ scale: isActive ? (1 + volume / 150) : 0.8, opacity: isActive ? (0.4 + volume / 200) : 0.1, boxShadow: isActive ? `0 0 ${20 + volume}px ${10 + volume / 2}px rgba(255, 255, 255, 0.4)` : `0 0 10px rgba(255, 255, 255, 0.1)` }} className="w-24 h-24 bg-white rounded-full mb-12 mx-auto" />
            <p className="text-blue-300 font-extralight tracking-[0.3em] mb-10 h-6">{isActive ? "君の咆哮が、星を創る" : "静かな夜、航海の準備を"}</p>
            <button onClick={isActive ? stopMonitoring : startMonitoring} className={`w-full py-4 rounded-full font-light tracking-widest border transition-all duration-500 ${isActive ? 'border-red-500/50 text-red-200 bg-red-900/10' : 'border-blue-400 text-blue-100 bg-transparent'}`}>{isActive ? "航海を終了する" : "航海を開始する"}</button>
            <div className="mt-10">
              <p className="text-slate-500 text-[9px] tracking-[0.3em] uppercase mb-1">Cumulative Energy</p>
              <p className="text-white text-3xl font-light tracking-tighter">{totalEnergy.toLocaleString()} <span className="text-xs text-blue-400 ml-1 font-mono">stella</span></p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}