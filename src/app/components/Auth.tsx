'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function Auth({ showToast }: AuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthday, setBirthday] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async () => {
    setLoading(true);
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nickname, birthday }
        }
      });

      if (!error && data.user) {
        await supabase.from('profiles').insert([
          { id: data.user.id, nickname, birthday }
        ]);
        showToast('登録完了！', 'success');
      } else if (error) {
        showToast(error.message, 'error');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showToast(error.message, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm p-8 bg-slate-900/40 backdrop-blur-xl border border-blue-900/30 rounded-3xl" role="form" aria-label={isSignUp ? '新規登録' : 'ログイン'}>
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
            aria-label="ニックネーム"
          />
          <input
            type="date"
            className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
            onChange={(e) => setBirthday(e.target.value)}
            aria-label="誕生日"
          />
        </>
      )}

      <input
        type="email"
        placeholder="Email"
        className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
        onChange={(e) => setEmail(e.target.value)}
        aria-label="メールアドレス"
      />
      <input
        type="password"
        placeholder="Password"
        className="bg-slate-950/50 border border-blue-900/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-light"
        onChange={(e) => setPassword(e.target.value)}
        aria-label="パスワード"
      />

      <button
        onClick={handleAuth}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-light py-4 rounded-xl tracking-[0.2em] transition-all mt-4 disabled:opacity-50"
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