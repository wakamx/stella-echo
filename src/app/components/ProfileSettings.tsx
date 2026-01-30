'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface ProfileSettingsProps {
  initialData: { nickname: string; birthday: string };
  onBack: () => void;
  onUpdate: () => void; // 保存後にデータを再取得するためのコールバック
}

export default function ProfileSettings({ initialData, onBack, onUpdate }: ProfileSettingsProps) {
  const [nickname, setNickname] = useState(initialData.nickname);
  const [birthday, setBirthday] = useState(initialData.birthday);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ nickname, birthday })
        .eq('id', user.id);

      if (error) {
        alert('更新に失敗しました: ' + error.message);
      } else {
        alert('プロフィールを更新しました');
        onUpdate();
        onBack();
      }
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-sm bg-slate-900/60 backdrop-blur-2xl p-8 rounded-3xl border border-blue-900/30 shadow-2xl animate-in fade-in zoom-in duration-300">
      <h3 className="text-white text-center text-xl font-light tracking-[0.2em] mb-8">VOYAGER SETTINGS</h3>
      
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <label className="text-blue-400 text-[10px] tracking-[0.2em] uppercase ml-1">Nickname</label>
          <input
            type="text"
            value={nickname}
            className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-blue-400 text-[10px] tracking-[0.2em] uppercase ml-1">Birthday</label>
          <input
            type="date"
            value={birthday}
            className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light text-sm"
            onChange={(e) => setBirthday(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 mt-8">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-light py-4 rounded-xl tracking-[0.2em] transition-all disabled:opacity-50"
          >
            {loading ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
          <button
            onClick={onBack}
            className="w-full bg-transparent text-slate-500 text-[10px] tracking-widest py-2 hover:text-slate-300 transition-colors"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}