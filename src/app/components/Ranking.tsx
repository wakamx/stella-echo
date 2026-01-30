'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface RankingEntry {
  nickname: string;
  total_energy: number;
}

export default function Ranking({ monthlyAge, onBack }: { monthlyAge: number, onBack: () => void }) {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRanking() {
      const { data, error } = await supabase.rpc('get_monthly_ranking', { 
        target_age_months: monthlyAge 
      });
      if (!error && data) setRanking(data);
      setLoading(false);
    }
    fetchRanking();
  }, [monthlyAge]);

  return (
    <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-2xl p-8 rounded-3xl border border-blue-900/30 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center mb-8">
        <button onClick={onBack} className="text-blue-400 text-xs tracking-widest hover:text-blue-200 transition-colors">
          ← BACK TO SKY
        </button>
        <span className="bg-blue-600/20 text-blue-300 text-[10px] px-3 py-1 rounded-full border border-blue-500/30 tracking-widest">
          生後 {monthlyAge} ヶ月の銀河
        </span>
      </div>

      <h3 className="text-white text-center text-xl font-light tracking-[0.2em] mb-8">VOYAGER RANKING</h3>

      {loading ? (
        <div className="py-20 text-center text-slate-500 text-xs animate-pulse tracking-widest">ANALYZING GALAXY...</div>
      ) : (
        <div className="space-y-4">
          {ranking.map((entry, index) => (
            <div 
              key={index} 
              className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                index === 0 ? 'bg-blue-600/10 border-blue-400/50 scale-105 shadow-[0_0_20px_rgba(37,99,235,0.2)]' : 'bg-slate-950/40 border-white/5'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className={`text-xs font-mono ${index < 3 ? 'text-blue-400' : 'text-slate-600'}`}>
                  {(index + 1).toString().padStart(2, '0')}
                </span>
                <span className="text-blue-100 text-sm font-light tracking-wide">{entry.nickname}</span>
              </div>
              <div className="text-right">
                <span className="text-white text-sm font-light">{Math.round(entry.total_energy).toLocaleString()}</span>
                <span className="text-blue-400 text-[9px] ml-1 uppercase">stella</span>
              </div>
            </div>
          ))}
          {ranking.length === 0 && (
            <p className="text-center text-slate-600 text-xs py-10">まだこの月齢の航海士はいません。</p>
          )}
        </div>
      )}
    </div>
  );
}