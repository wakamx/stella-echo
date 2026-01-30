'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Profile {
  id: string;
  nickname: string;
  birthday: string;
  created_at: string;
  is_admin?: boolean;
}

interface Log {
  id: string;
  intensity_db: number;
  created_at: string;
  user_id: string;
}

export default function Admin({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [recentLogs, setRecentLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 全ユーザー取得（作成日順）
      const { data: usersData, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (userError) console.error("Admin User Fetch Error:", userError);
      
      // 直近の全ログ取得（誰がいつ叫んだか）
      const { data: logsData, error: logError } = await supabase
        .from('energy_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logError) console.error("Admin Log Fetch Error:", logError);

      if (usersData) setUsers(usersData);
      if (logsData) setRecentLogs(logsData);
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="w-full max-w-4xl bg-slate-900/90 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-red-900/30 shadow-2xl animate-in fade-in zoom-in duration-300 h-[80vh] flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <h2 className="text-red-400 text-xl font-light tracking-[0.2em] flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
          ADMIN CONSOLE
        </h2>
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors text-xs tracking-widest border border-slate-700 px-4 py-2 rounded-full">
          EXIT
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* 左カラム：ユーザーリスト */}
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 flex flex-col min-h-0">
          <h3 className="text-white text-xs tracking-widest mb-4 flex justify-between flex-shrink-0">
            <span>VOYAGERS</span>
            <span className="text-blue-400">{users.length} <span className="text-[9px] text-slate-500">PILOTS</span></span>
          </h3>
          <div className="overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700 flex-1">
            {users.map(user => (
              <div key={user.id} className={`flex justify-between items-center p-3 rounded-lg text-xs border ${user.is_admin ? 'bg-red-900/10 border-red-900/30' : 'bg-slate-900 border-transparent'}`}>
                <div>
                  <p className={`font-bold mb-0.5 ${user.is_admin ? 'text-red-300' : 'text-blue-200'}`}>
                    {user.nickname || 'No Name'} {user.is_admin && <span className="text-[9px] border border-red-500/50 px-1 rounded ml-1">ADMIN</span>}
                  </p>
                  <p className="text-slate-500 text-[10px]">
                    Joined: {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                   <p className="text-slate-600 font-mono text-[9px]">ID: {user.id.slice(0, 6)}...</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右カラム：最新ログ */}
        <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 flex flex-col min-h-0">
          <h3 className="text-white text-xs tracking-widest mb-4 flex-shrink-0">REALTIME LOGS (LATEST 50)</h3>
          <div className="overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700 flex-1">
            {recentLogs.map(log => {
              const user = users.find(u => u.id === log.user_id);
              return (
                <div key={log.id} className="flex items-center gap-3 p-2 border-b border-white/5 text-xs hover:bg-white/5 transition-colors">
                  <span className={`font-mono w-12 text-right ${log.intensity_db > 80 ? 'text-red-400 font-bold' : 'text-blue-300'}`}>
                    {log.intensity_db.toFixed(1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 truncate">{user?.nickname || 'Unknown'}</p>
                    <p className="text-slate-600 text-[9px]">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}