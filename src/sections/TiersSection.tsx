import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';

// Kullanıcılar — Kademe bazlı liste + sayım.
// Kullanıcı kararı (26 May 2026): "Normal / Onaylı / Premium kullanıcıları
// göreceğim bir menü lazım. Adetlerini de yazsın."
//
// Backend: rpc_admin_get_tier_stats + rpc_admin_list_users_by_tier (master-only).
// Tier tanımları kural.md §11.1 ile uyumlu — Premium > Verified > Normal
// (exclusive — bir kullanıcı tek tier'de sayılır).

type Tier = 'normal' | 'verified' | 'premium';

type TierUser = {
  id: string;
  displayName: string;
  email: string;
  isPremium: boolean;
  premiumUntil: number | null;
  isPhoneVerified: boolean;
};

type Stats = {
  normal: number;
  verified: number;
  premium: number;
  total: number;
};

const PAGE = 50;

const TIER_META: Record<Tier, { label: string; color: string; bg: string; border: string }> = {
  normal:   { label: 'Normal',  color: '#9CA3AF', bg: 'bg-slate-500/10',  border: 'border-slate-500/30' },
  verified: { label: 'Onaylı',  color: '#3B82F6', bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  premium:  { label: 'Premium', color: '#F59E0B', bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
};

export function TiersSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tier, setTier] = useState<Tier>('normal');
  const [users, setUsers] = useState<TierUser[]>([]);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState('');

  // Sayımlar — sayfa açılışında 1 kez + tier değişiminde gerekmez.
  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('rpc_admin_get_tier_stats');
    if (error) { setMsg('Sayım yüklenemedi: ' + error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    setStats({
      normal: Number(row?.normal_count || 0),
      verified: Number(row?.verified_count || 0),
      premium: Number(row?.premium_count || 0),
      total: Number(row?.total_count || 0),
    });
  }, []);

  // Liste — tier veya arama değişince yeniden.
  const loadUsers = useCallback(async (reset = true) => {
    setSearching(true); setMsg('');
    const newOffset = reset ? 0 : offset;
    const { data, error } = await supabase.rpc('rpc_admin_list_users_by_tier', {
      p_tier: tier,
      p_query: q.trim(),
      p_limit: PAGE,
      p_offset: newOffset,
    });
    setSearching(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    const rows: TierUser[] = (data || []).map((u: any) => ({
      id: u.id,
      displayName: u.display_name,
      email: u.email || '(mail yok)',
      isPremium: !!u.is_premium,
      premiumUntil: u.premium_until ?? null,
      isPhoneVerified: !!u.is_phone_verified,
    }));
    if (reset) {
      setUsers(rows);
      setOffset(rows.length);
    } else {
      setUsers((prev) => [...prev, ...rows]);
      setOffset(newOffset + rows.length);
    }
    setHasMore(rows.length === PAGE);
  }, [tier, q, offset]);

  // İlk yükleme — stats + ilk liste paralel.
  useEffect(() => {
    Promise.all([loadStats(), loadUsers(true)]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tier değişimi → liste yenile (ama stats sabit kalır).
  useEffect(() => {
    if (loading) return;
    loadUsers(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  // 31 May 2026: otomatik yenileme — tier SAYAÇLARI her 5 sn tazelenir.
  // Kullanıcı listesi polling'e ALINMADI (sayfalama/scroll/arama bozulmasın).
  useEffect(() => {
    const id = setInterval(() => { loadStats(); }, 5000);
    return () => clearInterval(id);
  }, [loadStats]);

  const onSearch = () => loadUsers(true);

  if (loading) return <Loading />;

  return (
    <div>
      {/* Sayım kartları — tıklanabilir tier sekmeleri */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.keys(TIER_META) as Tier[]).map((t) => {
          const m = TIER_META[t];
          const count = stats ? stats[t] : 0;
          const isActive = tier === t;
          return (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`rounded-2xl p-4 text-left transition-all border-2 ${
                isActive ? m.bg + ' ' + m.border : 'bg-card border-white/5 hover:border-white/15'
              }`}
            >
              <p className="text-[11px] uppercase tracking-widest font-bold mb-1" style={{ color: m.color }}>
                {m.label}
              </p>
              <p className="text-3xl font-serif font-bold" style={{ color: isActive ? m.color : '#fff' }}>
                {count.toLocaleString('tr-TR')}
              </p>
              <p className="text-white/40 text-[10px] mt-1">
                {stats && stats.total > 0
                  ? '%' + ((count / stats.total) * 100).toFixed(1) + ' toplam'
                  : 'kullanıcı'}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mb-2 text-white/50 text-[11px]">
        Toplam: <span className="text-white/80 font-bold">{stats?.total.toLocaleString('tr-TR') || 0}</span> kullanıcı
        {' · '}
        Görüntülenen: <span className="text-white/80 font-bold">{TIER_META[tier].label}</span>
      </div>

      {/* Arama */}
      <div className="flex gap-2 mb-4 max-w-xl">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="Mail veya isimde ara (boş = tümü)…"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-primary/50"
        />
        <button
          onClick={onSearch}
          disabled={searching}
          className="bg-primary text-black font-bold rounded-lg px-5 text-sm disabled:opacity-50"
        >
          {searching ? '…' : 'Ara'}
        </button>
        {q && (
          <button
            onClick={() => { setQ(''); setTimeout(() => loadUsers(true), 0); }}
            className="px-3 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5"
          >
            Temizle
          </button>
        )}
      </div>

      <StatusMessage text={msg} />

      {users.length === 0 ? (
        <EmptyState text="Bu kademede kullanıcı yok." />
      ) : (
        <div className="flex flex-col gap-2 max-w-2xl">
          {users.map((u) => (
            <div key={u.id} className="bg-card border border-white/5 rounded-xl p-3">
              <p className="font-bold text-sm truncate">{u.email}</p>
              <p className="text-[11px] text-white/55 truncate mt-0.5">{u.displayName}</p>
              <div className="flex gap-2 mt-2 text-[10px]">
                {u.isPhoneVerified && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    Onaylı
                  </span>
                )}
                {u.isPremium && (!u.premiumUntil || u.premiumUntil > Date.now()) && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    Premium
                    {u.premiumUntil ? ' — ' + new Date(u.premiumUntil).toLocaleDateString('tr-TR') : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              onClick={() => loadUsers(false)}
              disabled={searching}
              className="py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-50"
            >
              {searching ? 'Yükleniyor…' : 'Daha fazla göster'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
