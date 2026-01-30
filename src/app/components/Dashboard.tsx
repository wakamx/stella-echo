'use client';

import { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, LineChart, Line, CartesianGrid
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

interface EnergyLog {
  id: string;
  intensity_db: number;
  created_at: string;
}

interface DashboardProps {
  logs: EnergyLog[];
  onBack: () => void;
}

// パターン表示用のカラーパレット（7色）
const PATTERN_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
];

export default function Dashboard({ logs, onBack }: DashboardProps) {
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'pattern'>('day');
  const [selectedDayData, setSelectedDayData] = useState<{
    date: string;
    logs: { time: string; intensity: number }[];
    peakTime: string;
    peakValue: number;
  } | null>(null);

  // メイングラフ（日次・月次）の集計
  const mainChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(log => {
      const date = new Date(log.created_at);
      const key = viewMode === 'day' 
        ? date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
        : date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' });
      counts[key] = (counts[key] || 0) + log.intensity_db;
    });

    return Object.entries(counts)
      .map(([name, total]) => ({ name, total: Math.round(total) }))
      .reverse();
  }, [logs, viewMode]);

  // 表示する対象の日付リスト（直近7日）を先に算出
  const targetPatternDays = useMemo(() => {
    return [...new Set(logs.map(l => new Date(l.created_at).toLocaleDateString()))].slice(0, 7);
  }, [logs]);

  // パターン（オーバーレイ）集計
  const patternData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      average: 0,
      count: 0,
      days: {} as Record<string, number>
    }));
    
    logs.forEach(log => {
      const date = new Date(log.created_at);
      const h = date.getHours();
      const dateStr = date.toLocaleDateString();
      hours[h].average += log.intensity_db;
      hours[h].count += 1;
      
      if (targetPatternDays.includes(dateStr)) {
        hours[h].days[dateStr] = (hours[h].days[dateStr] || 0) + log.intensity_db;
      }
    });
    return hours.map(h => ({
      ...h,
      average: h.count > 0 ? Math.round(h.average / h.count) : 0,
      ...h.days
    }));
  }, [logs, targetPatternDays]);

  const handleBarClick = (data: any) => {
    if (!data || viewMode !== 'day') return;
    const clickedDateName = data.name;

    const rawDayLogs = logs.filter(log => 
      new Date(log.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }) === clickedDateName
    );

    if (rawDayLogs.length === 0) return;

    const peakLog = [...rawDayLogs].sort((a, b) => b.intensity_db - a.intensity_db)[0];
    const peakTime = new Date(peakLog.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const peakValue = peakLog.intensity_db;

    const timeSlots = Array.from({ length: 24 }, (_, i) => {
      const hour = String(i).padStart(2, '0');
      return {
        time: `${hour}:00`,
        intensity: 0,
        count: 0
      };
    });

    rawDayLogs.forEach(log => {
      const date = new Date(log.created_at);
      const hourIndex = date.getHours(); // 0~23
      timeSlots[hourIndex].intensity += log.intensity_db;
      timeSlots[hourIndex].count += 1;
    });

    const formattedLogs = timeSlots.map(slot => ({
      time: slot.time,
      intensity: slot.count > 0 ? Math.round(slot.intensity / slot.count * 10) / 10 : 0
    }));

    setSelectedDayData({
      date: clickedDateName,
      logs: formattedLogs,
      peakTime,
      peakValue
    });
  };

  return (
    <div className="w-full max-w-2xl bg-slate-900/60 backdrop-blur-2xl p-6 rounded-3xl border border-blue-900/30 shadow-2xl relative min-h-[450px]">
      
      <AnimatePresence>
        {selectedDayData && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-30 bg-slate-950 p-6 flex flex-col"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-blue-400 text-[10px] tracking-widest uppercase">{selectedDayData.date} / CHRONICLE</p>
                <h3 className="text-white text-xl font-light">時間別エネルギー推移 (24H)</h3>
              </div>
              <button onClick={() => setSelectedDayData(null)} className="text-slate-500 hover:text-white transition-colors text-xs tracking-widest px-4 py-2 bg-slate-900 rounded-full border border-white/5">
                CLOSE
              </button>
            </div>

            <div className="flex-1 min-h-[200px] w-full mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selectedDayData.logs}>
                  <defs>
                    <linearGradient id="colorIntensity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#334155" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false}
                    interval={3}
                  />
                  <YAxis hide domain={[0, 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e3a8a', borderRadius: '8px', fontSize: '10px' }} itemStyle={{ color: '#60a5fa' }} />
                  <Area 
                    type="monotone" 
                    dataKey="intensity" 
                    stroke="#60a5fa" 
                    fillOpacity={1} 
                    fill="url(#colorIntensity)" 
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/5">
              <div className="text-center">
                <p className="text-slate-500 text-[9px] tracking-widest uppercase mb-1">Peak Time</p>
                <p className="text-blue-100 text-lg font-light">{selectedDayData.peakTime}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-500 text-[9px] tracking-widest uppercase mb-1">Peak Energy</p>
                <p className="text-blue-100 text-lg font-light">{selectedDayData.peakValue.toFixed(1)} <span className="text-[10px] text-blue-400">db</span></p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center mb-8">
        <button onClick={onBack} className="text-blue-400 text-xs tracking-widest flex items-center gap-2 hover:text-blue-200">
          ← BACK TO SKY
        </button>
        <div className="flex bg-slate-950 rounded-full p-1 border border-blue-900/50">
          {['day', 'month', 'pattern'].map((mode) => (
            <button 
              key={mode}
              onClick={() => setViewMode(mode as any)}
              className={`px-4 py-1.5 rounded-full text-[10px] tracking-widest transition-all ${viewMode === mode ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <p className="text-slate-600 text-[9px] mb-6 text-center tracking-[0.3em] uppercase">
        {viewMode === 'day' ? '棒をタップして一日の流れを解析' : 
         viewMode === 'month' ? '月間集計データ' : '24時間リズムの重なり（直近7日間）'}
      </p>

      <div className="h-64 w-full cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'pattern' ? (
            <LineChart data={patternData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="hour" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }} 
                itemSorter={(item) => (item.value as number) * -1}
              />
              <Line type="monotone" dataKey="average" stroke="#ffffff" strokeWidth={3} dot={false} animationDuration={2000} strokeDasharray="2 2" />
              {targetPatternDays.map((date, index) => (
                <Line 
                  key={date} 
                  type="monotone" 
                  dataKey={date} 
                  stroke={PATTERN_COLORS[index % PATTERN_COLORS.length]} 
                  strokeWidth={1.5} 
                  opacity={0.7} 
                  dot={false} 
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={mainChartData}>
              <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={10} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} onClick={(data) => handleBarClick(data)}>
                {mainChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill="url(#mainBarGradient)" className="hover:brightness-125 transition-all" />
                ))}
              </Bar>
              <defs>
                <linearGradient id="mainBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.2} />
                </linearGradient>
              </defs>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}