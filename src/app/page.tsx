'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Ranking from './components/Ranking';
import ProfileSettings from './components/ProfileSettings';
import Admin from './components/Admin';

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

  // 【追加】記録中の一時データを保持するRef（stopMonitoringからもアクセス可能にするため）
  const recordingRef = useRef<{ history: number[], startTime: number }>({ history: [], startTime: 0 });

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
      console.error("Wake Lock 失敗:", err);
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

  // 【修正】蓄積されたデータを保存する共通関数
  // awaitを削除し、内部で非同期処理を完結させることでループを止めないように変更
  const saveRecordingData = () => {
    const now = Date.now();
    // データを即座にローカル変数へ退避
    const currentHistory = [...recordingRef.current.history];
    const currentStartTime = recordingRef.current.startTime;
    
    // バッファを即座にリセット（二重送信防止とループ継続のため）
    recordingRef.current.history = [];
    recordingRef.current.startTime = now;

    if (currentHistory.length === 0) return;

    // 経過時間を計算（秒）
    const duration = (now - currentStartTime) / 1000;
    if (duration < 1) return; // 1秒未満のデータは無視

    const averageVolume = currentHistory.reduce((a, b) => a + b) / currentHistory.length;
    
    // UI更新（即時反映）
    setTotalEnergy(prev => prev + Math.round(averageVolume));
    setIsLaunching(true);

    // サーバー送信処理（非同期で実行・Fire and forget）
    if (!isGuest && user) {
      (async () => {
        try {
          // ネットワーク状態チェック（簡易）
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.warn("Offline: Skipping sync");
            return;
          }

          const insertData = { 
            intensity_db: Math.round(averageVolume * 10) / 10, 
            duration_sec: Math.round(duration) 
          };

          let { data, error } = await supabase.from('energy_logs').insert([insertData]).select().single();
          
          // エラー時の再試行ロジック（特に認証切れ対策）
          if (error) {
            console.error("Sync failed:", error.message);
            // 認証エラーやJWT期限切れの場合、セッションリフレッシュを試みる
            // PostgrestErrorにstatusプロパティがないため、anyキャストで回避
            if (error.code === 'PGRST301' || error.message.includes("JWT") || (error as any).status === 401) {
              console.log("Attempting session refresh...");
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              
              if (!refreshError && refreshData.session) {
                // セッション更新成功後に再送
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
  };

  // 【変更】停止時に残りのデータを保存するように修正
  const stopMonitoring = () => {
    cleanup(); // 先にマイク等を停止
    saveRecordingData(); // 残っているデータを保存（非同期）
    setIsActive(false);
  };

  const fetchPastData = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('nickname, birthday, is_admin')
      .eq('id', userId)
      .single();
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
    
    // 【変更】Refの初期化
    recordingRef.current = { history: [], startTime: Date.now() };

    const update = async () => {
      if (!analyserRef.current) return;

      // AudioContextの状態確認と復帰
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
      
      // 【変更】Refにデータを蓄積
      recordingRef.current.history.push(avg);

      // 15秒経過したら保存
      if (Date.now() - recordingRef.current.startTime > 15000) {
        // awaitを削除：描画ループをブロックしないようにする
        saveRecordingData();
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const startMonitoring = async () => {
    try {
      // 開始前にセッションが有効か軽くチェック（無効なら更新を試みる）
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
      alert("マイクの使用を許可してください。または他のアプリがマイクを使用中の可能性があります。");
    }
  };

  const handleLogoutAction = async () => {
    stopMonitoring(); // ログアウト時もデータを保存（非同期）
    await supabase.auth.signOut();
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => handleUserChange(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => handleUserChange(session?.user ?? null));
    
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
        // 復帰時にAudioContextも確認
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
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
                {profile?.is_admin && (
                  <button onClick={() => setView('admin')} className="text-[9px] tracking-widest text-red-500/50 hover:text-red-400 transition-colors">ADMIN</button>
                )}
                
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
        ) : view === 'admin' && profile?.is_admin ? (
          <Admin onBack={() => setView('home')} />
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