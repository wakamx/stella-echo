'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthday, setBirthday] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // ログインと登録の切り替え用

  const handleAuth = async () => {
    setLoading(true);
    if (isSignUp) {
      // --- 新規登録 ---
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nickname, birthday } // メタデータとして保存
        }
      });
      
      if (!error && data.user) {
        // profilesテーブルに初期情報を挿入
        await supabase.from('profiles').insert([
          { id: data.user.id, nickname, birthday }
        ]);
        alert('登録完了！');
      } else if (error) {
        alert(error.message);
      }
    } else {
      // --- ログイン ---
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm p-8 bg-slate-900/40 backdrop-blur-xl border border-blue-900/30 rounded-3xl">
      <h2 className="text-blue-100 text-center tracking-widest text-sm mb-4">
        {isSignUp ? 'NEW VOYAGER' : 'WELCOME BACK'}
      </h2>

      {isSignUp && (
        <>
          <input
            type="text"
            placeholder="Nickname (航海士名)"
            className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
            onChange={(e) => setNickname(e.target.value)}
          />
          <input
            type="date"
            className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
            onChange={(e) => setBirthday(e.target.value)}
          />
        </>
      )}

      <input
        type="email"
        placeholder="Email"
        className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        onClick={handleAuth}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-light py-4 rounded-xl tracking-[0.2em] transition-all mt-4"
      >
        {loading ? 'WAITING...' : isSignUp ? 'SIGN UP' : 'LOGIN'}
      </button>

      <button
        onClick={() => setIsSignUp(!isSignUp)}
        className="text-blue-400/60 text-[10px] tracking-widest mt-2 hover:text-blue-300 transition-colors"
      >
        {isSignUp ? 'ALREADY HAVE AN ACCOUNT?' : 'CREATE NEW ACCOUNT'}
      </button>
    </div>
  );
}