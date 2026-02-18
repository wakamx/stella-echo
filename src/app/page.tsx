'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { useEnergySync } from '@/hooks/useEnergySync';
import { useAudioMonitor } from '@/hooks/useAudioMonitor';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Ranking from './components/Ranking';
import ProfileSettings from './components/ProfileSettings';
import Admin from './components/Admin';
import ToastContainer from './components/Toast';

export default function NightSky() {
  const [view, setView] = useState<'home' | 'dashboard' | 'ranking' | 'settings' | 'admin'>('home');
  const [isLaunching, setIsLaunching] = useState(false);

  const { toasts, showToast, dismissToast } = useToast();
  const { user, profile, isGuest, totalEnergy, setTotalEnergy, history, setHistory, fetchPastData, logout, enterGuestMode, exitGuestMode } = useAuth(showToast);

  const { resetRecording, pushVolume, shouldFlush, saveRecordingData } = useEnergySync({
    user,
    isGuest,
    setTotalEnergy,
    setHistory,
    onLaunch: () => setIsLaunching(true),
    showToast,
  });

  const { volume, isActive, startMonitoring, stopMonitoring } = useAudioMonitor({
    isGuest,
    onData: (avg) => pushVolume(avg),
    onFlushCheck: shouldFlush,
    onFlush: saveRecordingData,
    showToast,
  });

  // resetRecordingをstartMonitoring前に呼ぶラッパー
  const handleStart = useCallback(() => {
    resetRecording();
    startMonitoring();
  }, [resetRecording, startMonitoring]);

  const handleLogout = useCallback(async () => {
    stopMonitoring();
    await logout();
    setView('home');
  }, [stopMonitoring, logout]);

  const calculateMonthlyAge = (birthdayStr: string) => {
    if (!birthdayStr) return 0;
    const birth = new Date(birthdayStr);
    const now = new Date();
    const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    return months < 0 ? 0 : months;
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 overflow-hidden relative font-sans" role="main">
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
        <nav className="fixed top-6 left-6 right-6 flex justify-between items-center z-50" role="navigation" aria-label="メインナビゲーション">
          <button onClick={() => !isGuest && setView('settings')} className="flex flex-col text-left group transition-opacity" aria-label="プロフィール設定">
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
                  <button onClick={() => setView('admin')} className="text-[9px] tracking-widest text-red-500/50 hover:text-red-400 transition-colors" aria-label="管理画面">ADMIN</button>
                )}
                <button onClick={() => setView('ranking')} className={`text-[9px] tracking-widest transition-colors ${view === 'ranking' ? 'text-blue-400' : 'text-slate-500 hover:text-blue-200'}`} aria-label="ランキング">RANKING</button>
                <button onClick={() => setView('dashboard')} className={`text-[9px] tracking-widest transition-colors ${view === 'dashboard' ? 'text-blue-400' : 'text-slate-500 hover:text-blue-200'}`} aria-label="ダッシュボード">DASHBOARD</button>
              </>
            )}
            <button onClick={isGuest ? exitGuestMode : handleLogout} className="text-slate-500 text-[9px] tracking-widest hover:text-red-400 px-3 py-1 bg-slate-900/40 rounded-full border border-white/5" aria-label={isGuest ? "ゲストモード終了" : "ログアウト"}>
              {isGuest ? "EXIT" : "LOGOUT"}
            </button>
          </div>
        </nav>
      )}

      <div className="relative flex flex-col items-center justify-center z-10 w-full max-w-md px-6">
        {!user && !isGuest ? (
          <div className="flex flex-col items-center gap-8 w-full mt-[-5vh]">
            <h1 className="text-blue-100 text-3xl font-extralight tracking-[0.3em] mb-4">STELLA ECHO</h1>
            <Auth showToast={showToast} />
            <button onClick={enterGuestMode} className="text-blue-400/60 text-[10px] tracking-widest underline underline-offset-8 decoration-blue-900/50 hover:text-blue-300 transition-colors">GUEST MODE</button>
          </div>
        ) : view === 'settings' && profile ? (
          <ProfileSettings initialData={profile} onBack={() => setView('home')} onUpdate={() => fetchPastData(user!.id)} showToast={showToast} />
        ) : view === 'admin' && profile?.is_admin ? (
          <Admin onBack={() => setView('home')} />
        ) : view === 'ranking' && !isGuest ? (
          <Ranking monthlyAge={calculateMonthlyAge(profile?.birthday || "")} onBack={() => setView('home')} />
        ) : view === 'dashboard' ? (
          <Dashboard logs={history} onBack={() => setView('home')} />
        ) : (
          <div className="text-center">
            <motion.div
              animate={{
                scale: isActive ? (1 + volume / 150) : 0.8,
                opacity: isActive ? (0.4 + volume / 200) : 0.1,
                boxShadow: isActive ? `0 0 ${20 + volume}px ${10 + volume / 2}px rgba(255, 255, 255, 0.4)` : `0 0 10px rgba(255, 255, 255, 0.1)`,
              }}
              className="w-24 h-24 bg-white rounded-full mb-12 mx-auto"
              role="img"
              aria-label={isActive ? `現在の音量: ${Math.round(volume)}` : "待機中"}
            />
            <p className="text-blue-300 font-extralight tracking-[0.3em] mb-10 h-6">
              {isActive ? "君の咆哮が、星を創る" : "静かな夜、航海の準備を"}
            </p>
            <button
              onClick={isActive ? stopMonitoring : handleStart}
              className={`w-full py-4 rounded-full font-light tracking-widest border transition-all duration-500 ${isActive ? 'border-red-500/50 text-red-200 bg-red-900/10' : 'border-blue-400 text-blue-100 bg-transparent'}`}
              aria-label={isActive ? "航海を終了" : "航海を開始"}
            >
              {isActive ? "航海を終了する" : "航海を開始する"}
            </button>
            <div className="mt-10">
              <p className="text-slate-500 text-[9px] tracking-[0.3em] uppercase mb-1">Cumulative Energy</p>
              <p className="text-white text-3xl font-light tracking-tighter">
                {totalEnergy.toLocaleString()} <span className="text-xs text-blue-400 ml-1 font-mono">stella</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}