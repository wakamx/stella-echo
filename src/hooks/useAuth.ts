'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface Profile {
    nickname: string;
    birthday: string;
    is_admin?: boolean;
}

interface EnergyLog {
    id: string;
    intensity_db: number;
    created_at: string;
}

export function useAuth(showToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isGuest, setIsGuest] = useState(false);
    const [totalEnergy, setTotalEnergy] = useState(0);
    const [history, setHistory] = useState<EnergyLog[]>([]);

    const fetchPastData = useCallback(async (userId: string) => {
        const { data: profileData } = await supabase
            .from('profiles')
            .select('nickname, birthday, is_admin')
            .eq('id', userId)
            .single();
        if (profileData) setProfile(profileData);

        const { data: allData } = await supabase.from('energy_logs').select('intensity_db').eq('user_id', userId);
        if (allData) {
            setTotalEnergy(Math.round(allData.reduce((acc: number, row: { intensity_db: number }) => acc + row.intensity_db, 0)));
        }

        const { data: allLogs } = await supabase.from('energy_logs').select('id, intensity_db, created_at').eq('user_id', userId).order('created_at', { ascending: false });
        if (allLogs) setHistory(allLogs);
    }, []);

    const handleUserChange = useCallback(async (currentUser: User | null) => {
        setUser(currentUser);
        if (currentUser) {
            setIsGuest(false);
            await fetchPastData(currentUser.id);
        } else {
            setTotalEnergy(0);
            setHistory([]);
            setProfile(null);
        }
    }, [fetchPastData]);

    const logout = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const enterGuestMode = useCallback(() => {
        setIsGuest(true);
    }, []);

    const exitGuestMode = useCallback(() => {
        setIsGuest(false);
    }, []);

    // セッション監視
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => handleUserChange(session?.user ?? null));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => handleUserChange(session?.user ?? null));
        return () => {
            subscription.unsubscribe();
        };
    }, [handleUserChange]);

    return {
        user,
        profile,
        isGuest,
        totalEnergy,
        setTotalEnergy,
        history,
        setHistory,
        fetchPastData,
        logout,
        enterGuestMode,
        exitGuestMode,
    };
}
