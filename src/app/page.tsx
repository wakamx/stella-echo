'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Ranking from './components/Ranking';
import ProfileSettings from './components/ProfileSettings';
import Admin from './components/Admin';

// --- 型定義 ---
interface EnergyLog {
  id: string;
  intensity_db: number;
  created_at: string;
}

interface Profile {
  nickname: string;
  birthday: string;
  is_admin?: boolean;
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
}

export default function NightSky() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<'home' | 'dashboard' | 'ranking' | 'settings' | 'admin'>('home'); 
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
  const wakeLockRef = useRef<any>(null);
  const recordingRef = useRef<{ history: number[], startTime: number }>({ history: [], startTime: 0 });

  // --- 【新機能】ランダムな星々の生成 ---
  // 累計エネルギーに応じて、表示する星の数を動的に計算（最大150個）
  const stars = useMemo(() => {
    const count = Math.min(50 + Math.floor(totalEnergy / 50), 150);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: 2 + Math.random() * 4,
      delay: Math.random() * 5
    }));
  }, [totalEnergy]);

  // --- 既存のロジック ---
  const calculateMonthlyAge = (birthdayStr: string) => {
    if (!birthdayStr) return 0;
    const birth = new Date(birthdayStr);
    const now = new Date(); 
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    return months < 0 ? 0 : months;
  };

  const requestWakeLock = async () => {
    try { 
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.error("Wake Lock failed:", err);
    }
  };

  const releaseWakeLock = () => { 
    if (wakeLockRef.current) { 
      wakeLockRef.current.release(); 
      wakeLockRef.current = null; 
    } 
  };

  const cleanup = () => {
    releaseWakeLock();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
    setVolume(0);
  };

  const saveRecordingData = async () => {
    const currentHistory = [...recordingRef.current.history];
    const currentStartTime = recordingRef.current.startTime;
    const now = Date.now();
    
    recordingRef.current.history = [];
    recordingRef.current.startTime = now;
    
    if (currentHistory.length === 0) return;
    
    const duration = (now - currentStartTime) / 1000;
    if (duration < 1) return;
    
    const averageVolume = currentHistory.reduce((a, b) => a + b) / currentHistory.length;
    
    if (!isGuest && user) {
      const { data, error } = await supabase.from('energy_logs').insert([
        { intensity_db: Math.round(averageVolume * 10) / 10, duration_sec: Math.round(duration) }
      ]).select().single();
      
      if (!error && data) setHistory(prev => [data, ...prev]);
    }
    setTotalEnergy(prev => prev + Math.round(averageVolume));
    setIsLaunching(true);
  };

  const stopMonitoring = async () => {
    cleanup();
    await saveRecordingData();
    setIsActive(false);
  };

  const fetchPastData = async (userId: string) => {
    const { data: profileData } = await supabase.from('profiles').select('nickname, birthday, is_admin').eq('id', userId).single();
    if (profileData) setProfile(profileData);
    
    const { data: allData } = await supabase.from('energy_logs').select('intensity_db').eq('user_id', userId);
    if (allData) setTotalEnergy(Math.round(allData.reduce((acc, row) => acc + row.intensity_db, 0)));
    
    const { data: allLogs } = await supabase.from('energy_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (allLogs) setHistory(allLogs);
  };

  const handleUserChange = async (currentUser: User | null) => {
    setUser(currentUser);
    if (currentUser) { 
      await fetchPastData(currentUser.id); 
    } else { 
      setTotalEnergy(0); 
      setHistory([]); 
      setProfile(null); 
      setView('home'); 
    }
  };

  const monitor = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    recordingRef.current = { history: [], startTime: Date.now() };
    
    const update = async () => {
      if (!analyserRef.current) return;
      if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setVolume(avg);
      recordingRef.current.history.push(avg);
      
      if (Date.now() - recordingRef.current.startTime > 60000) await saveRecordingData();
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
      audioContextRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
      
      await requestWakeLock();
      setIsActive(true);
      monitor();
    } catch (err) { 
      alert("マイクの使用を許可してください。スマホの設定からブラウザのマイク権限を確認してください。"); 
    }
  };

  const handleLogoutAction = async () => {
    await stopMonitoring();
    await supabase.auth.signOut();
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => handleUserChange(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => handleUserChange(s?.user ?? null));
    
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
      
      {/* --- 【背景】動的な星空レイヤー --- */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map((star) => (
          <motion.div
            key={star.id}
            initial={{ opacity: 0.1 }}
            animate={{ 
              opacity: isActive ? [0.1, 0.4 + (volume / 100), 0.1] : [0.1, 0.3, 0.1],
              scale: isActive ? [1, 1 + (volume / 200), 1] : 1
            }}
            transition={{ 
              duration: star.duration, 
              repeat: Infinity, 
              delay: star.delay,
              ease: "easeInOut"
            }}
            style={{
              position: 'absolute',
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              backgroundColor: 'white',
              borderRadius: '50%',
              boxShadow: '0 0 5px rgba(255,255,255,0.3)'
            }}
          />
        ))}
      </div>

      {/* 背景オーロラ（蓄積量に応じて色が濃くなる） */}
      <motion.div 
        animate={{ opacity: 0.2 + Math.min(totalEnergy / 1000, 0.3) }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_var(--tw-gradient-stops))] from-blue-900 via-transparent to-transparent" 
      />

      {/* --- 打ち上げ演出（ランダムな位置にランタンのように昇る） --- */}
      <AnimatePresence>
        {isLaunching && (
          <motion.div
            initial={{ opacity: 0, y: 100, x: `${40 + Math.random() * 20}%` }}
            animate={{ opacity: [0, 1, 0], y: -500 }}
            transition={{ duration: 4, ease: "linear" }}
            onAnimationComplete={() => setIsLaunching(false)}
            className="absolute bottom-0 z-0 w-1 h-1 bg-blue-200 rounded-full shadow-[0_0_15px_5px_rgba(147,197,253,0.4)]"
          />
        )}
      </AnimatePresence>

      {/* --- メインコンテンツ --- */}
      <div className="relative z-10 w-full max-w-md px-6 flex flex-col items-center">
        {/* ビュー切り替えロジック */}
        {!user && !isGuest ? (
          <div className="flex flex-col items-center gap-8 w-full">
            <h1 className="text-blue-100 text-3xl font-extralight tracking-[0.3em] mb-4">STELLA ECHO</h1>
            <Auth />
            <button onClick={() => setIsGuest(true)} className="text-blue-400/60 text-[10px] tracking-widest underline underline-offset-8 decoration-blue-900/50 hover:text-blue-300 transition-colors">GUEST MODE</button>
          </div>
        ) : view === 'settings' && profile ? (
          <ProfileSettings initialData={profile} onBack={() => setView('home')} onUpdate={() => fetchPastData(user!.id)} />
        ) : view === 'admin' && profile?.is_admin ? (
          <Admin onBack={() => setView('home')} />
        ) : view === 'ranking' && !isGuest ? (
          <Ranking monthlyAge={calculateMonthlyAge(profile?.birthday || "")} onBack={() => setView('home')} />
        ) : view === 'dashboard' ? (
          <Dashboard logs={history} onBack={() => setView('home')} />
        ) : (
          /* メインの円とボタン */
          <div className="text-center w-full">
            <motion.div 
              animate={{ 
                scale: isActive ? (1 + volume / 180) : 0.8,
                opacity: isActive ? (0.6 + volume / 200) : 0.2,
                boxShadow: isActive ? `0 0 ${30 + volume}px ${10 + volume/4}px rgba(255, 255, 255, 0.3)` : `0 0 10px rgba(255, 255, 255, 0.1)`
              }}
              className="w-24 h-24 bg-white rounded-full mb-12 mx-auto" 
            />
            <p className="text-blue-300 font-extralight tracking-[0.3em] mb-10 h-6 text-sm">
              {isActive ? "宇宙に音が溶けていく" : "静かな夜、航海の準備を"}
            </p>
            <button 
              onClick={isActive ? stopMonitoring : startMonitoring} 
              className={`w-full py-4 rounded-full font-light tracking-widest border transition-all duration-700 ${isActive ? 'border-blue-500/30 text-blue-200 bg-blue-900/10' : 'border-blue-400 text-blue-100 bg-transparent'}`}
            >
              {isActive ? "航海を終了する" : "航海を開始する"}
            </button>
            <div className="mt-12">
              <p className="text-slate-500 text-[9px] tracking-[0.4em] uppercase mb-2">Total Accumulated Stella</p>
              <p className="text-white text-4xl font-extralight tracking-tighter">
                {totalEnergy.toLocaleString()} <span className="text-xs text-blue-400 ml-1 font-mono">stella</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* トップバー（ナビゲーション） */}
      {(user || isGuest) && view === 'home' && (
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
                {profile?.is_admin && (
                  <button onClick={() => setView('admin')} className="text-[9px] tracking-widest text-red-500/50 hover:text-red-400 transition-colors">ADMIN</button>
                )}
                <button onClick={() => setView('ranking')} className="text-[9px] tracking-widest text-slate-500 hover:text-blue-200 transition-colors">RANKING</button>
                <button onClick={() => setView('dashboard')} className="text-[9px] tracking-widest text-slate-500 hover:text-blue-200 transition-colors">DASHBOARD</button>
              </>
            )}
            <button onClick={isGuest ? () => setIsGuest(false) : handleLogoutAction} className="text-slate-500 text-[9px] tracking-widest hover:text-red-400 px-3 py-1 bg-slate-900/40 rounded-full border border-white/5 transition-colors">
              {isGuest ? "EXIT" : "LOGOUT"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}