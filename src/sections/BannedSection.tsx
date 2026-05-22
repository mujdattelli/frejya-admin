import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';

// Banlılar — banlı kullanıcıların listesi + ban kaldırma.
// 22 May 2026: panelde banlı kullanıcıyı görme / yanlış banı geri alma yolu
// yoktu. Liste + ban kaldırma master-only `rpc_admin_*` RPC'lerinden geçer.
type BannedUser = {
  id: string;
  display_name: string | null;
  username: string | null;
  banned_until: number | null;
  warning_count: number | null;
  role: string | null;
};

const PAGE = 50;

export function BannedSection() {
  const [users, setUsers] = useState<BannedUser[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('rpc_admin_list_banned', { p_limit: limit });
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    const list = (data as BannedUser[]) || [];
    setUsers(list);
    setHasMore(list.length === limit);
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const unban = async (u: BannedUser) => {
    if (!window.confirm(`"${u.display_name || u.username || u.id}" kullanıcısının banı kaldırılsın mı?`)) return;
    setBusy(u.id); setMsg('');
    const { error } = await supabase.rpc('rpc_admin_set_ban', { p_target_id: u.id, p_banned: false });
    setBusy(null);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    setMsg(`${u.display_name || u.username} banı kaldırıldı.`);
  };

  if (loading) return <Loading />;

  // Arama: isim / kullanıcı adı.
  const needle = q.trim().toLowerCase();
  const visible = users.filter((u) => {
    if (!needle) return true;
    return [u.display_name, u.username].filter(Boolean).join(' ').toLowerCase().includes(needle);
  });

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İsim veya kullanıcı adında ara…"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50"
        />
        {q && (
          <button onClick={() => setQ('')}
            className="px-3 py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5">
            Temizle
          </button>
        )}
      </div>
      <StatusMessage text={msg} />
      {users.length === 0 ? (
        <EmptyState text="Banlı kullanıcı yok." />
      ) : visible.length === 0 ? (
        <EmptyState text="Aramanıza uyan kullanıcı yok." />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((u) => (
            <div key={u.id} className="bg-card border border-white/5 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{u.display_name || u.username || u.id}</p>
                <p className="text-white/40 text-[11px] mt-0.5">
                  {u.username ? '@' + u.username : ''}
                  {(u.warning_count ?? 0) > 0 ? ` · ${u.warning_count} uyarı` : ''}
                </p>
              </div>
              <button
                onClick={() => unban(u)}
                disabled={busy === u.id}
                className="shrink-0 text-xs font-bold rounded-lg px-3 py-2 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 disabled:opacity-50"
              >
                {busy === u.id ? '…' : 'Banı Kaldır'}
              </button>
            </div>
          ))}
          {hasMore && (
            <button onClick={() => setLimit((l) => l + PAGE)}
              className="py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5">
              Daha fazla göster
            </button>
          )}
        </div>
      )}
    </div>
  );
}
