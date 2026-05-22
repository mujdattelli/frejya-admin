import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserDetailModal } from '../components/UserDetailModal';
import { StatusMessage } from '../components/ui';

// Yetkiler & Premium — mobil admin panelindeki "Yetkiler" sekmesinin web karşılığı.
// Aynı RPC'ler: rpc_admin_list_users (arama), rpc_set_user_role (admin yap/çıkar),
// rpc_admin_set_premium (premium ver/uzat/kaldır) — hepsi master-only, sunucuda.

type RoleUser = {
  id: string;
  displayName: string;
  role: string;
  isPremium: boolean;
  premiumUntil: number | null;
};

const roleLabel = (role: string) =>
  role === 'master' ? 'Admin (Master)'
  : role === 'moderator' ? 'Moderatör'
  : role === 'reviewer' ? 'Test Hesabı (Reviewer)'
  : 'Normal Kullanıcı';

export function RolesSection() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) { setMsg('En az 2 karakter girin.'); return; }
    setSearching(true); setMsg('');
    const { data, error } = await supabase.rpc('rpc_admin_list_users', { p_query: q });
    setSearching(false);
    if (error) { setMsg('Arama başarısız: ' + error.message); return; }
    const rows: RoleUser[] = (data || []).map((u: any) => ({
      id: u.id,
      displayName: u.display_name,
      role: u.role || 'user',
      isPremium: !!u.is_premium,
      premiumUntil: u.premium_until ?? null,
    }));
    setUsers(rows);
    if (rows.length === 0) setMsg('Sonuç yok.');
  };

  const toggleAdmin = async (u: RoleUser) => {
    const makeAdmin = u.role !== 'master';
    const newRole = makeAdmin ? 'master' : 'user';
    const ok = window.confirm(
      `"${u.displayName}" → ${makeAdmin ? 'ADMIN (master)' : 'normal kullanıcı'}\n\n` +
        (makeAdmin
          ? 'Bu kullanıcı tüm yönetim paneline erişebilecek.'
          : 'Bu kullanıcının yönetim paneli erişimi kaldırılacak.')
    );
    if (!ok) return;
    setBusy(u.id);
    const { error } = await supabase.rpc('rpc_set_user_role', { p_target_id: u.id, p_role: newRole });
    setBusy(null);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
    setMsg(`${u.displayName} → ${makeAdmin ? 'Admin' : 'Normal kullanıcı'}`);
  };

  const applyPremium = async (u: RoleUser, months: number) => {
    if (months === 0 && !window.confirm(`"${u.displayName}" premium üyeliği kaldırılsın mı?`)) return;
    setBusy(u.id);
    const { error } = await supabase.rpc('rpc_admin_set_premium', { p_target_id: u.id, p_months: months });
    setBusy(null);
    if (error) { setMsg('Hata: ' + error.message); return; }
    const now = Date.now();
    const newUntil =
      months === 0 ? null : Math.max(u.premiumUntil || now, now) + months * 30 * 24 * 60 * 60 * 1000;
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, isPremium: months > 0, premiumUntil: newUntil } : x))
    );
    setMsg(months === 0 ? `${u.displayName} premium kaldırıldı.` : `${u.displayName} → +${months} ay premium.`);
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 max-w-xl">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Kullanıcı adına göre ara…"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-primary/50"
        />
        <button
          onClick={search}
          disabled={searching}
          className="bg-primary text-black font-bold rounded-lg px-5 text-sm disabled:opacity-50"
        >
          {searching ? '…' : 'Ara'}
        </button>
      </div>

      <StatusMessage text={msg} />

      <div className="flex flex-col gap-2 max-w-2xl">
        {users.map((u) => {
          const premActive = u.isPremium && (!u.premiumUntil || u.premiumUntil > Date.now());
          const rowBusy = busy === u.id;
          return (
            <div key={u.id} className="bg-card border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{u.displayName}</p>
                  <p className={`text-[11px] mt-0.5 ${u.role === 'master' ? 'text-primary' : 'text-white/40'}`}>
                    {roleLabel(u.role)}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setDetailId(u.id)}
                    className="text-xs font-bold rounded-lg px-3 py-2 border border-white/15 bg-white/5 text-white/70"
                  >
                    Detay
                  </button>
                  <button
                    onClick={() => toggleAdmin(u)}
                    disabled={rowBusy}
                    className={`text-xs font-bold rounded-lg px-3 py-2 border disabled:opacity-50 ${
                      u.role === 'master'
                        ? 'text-red-400 border-red-500/40 bg-red-500/10'
                        : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                    }`}
                  >
                    {u.role === 'master' ? 'Yetkiyi Kaldır' : 'Admin Yap'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-white/5">
                <p className={`text-[11px] ${premActive ? 'text-amber-400' : 'text-white/40'}`}>
                  {premActive
                    ? `Premium${u.premiumUntil ? ' — ' + new Date(u.premiumUntil).toLocaleDateString('tr-TR') : ''}`
                    : 'Premium değil'}
                </p>
                <div className="flex gap-1.5 shrink-0">
                  {premActive ? (
                    <>
                      <button onClick={() => applyPremium(u, 1)} disabled={rowBusy}
                        className="text-[11px] font-bold rounded-md px-2.5 py-1.5 border border-amber-500/40 bg-amber-500/10 text-amber-400 disabled:opacity-50">
                        +1 Ay
                      </button>
                      <button onClick={() => applyPremium(u, 0)} disabled={rowBusy}
                        className="text-[11px] font-bold rounded-md px-2.5 py-1.5 border border-red-500/40 bg-red-500/10 text-red-400 disabled:opacity-50">
                        Kaldır
                      </button>
                    </>
                  ) : (
                    [1, 3, 12].map((m) => (
                      <button key={m} onClick={() => applyPremium(u, m)} disabled={rowBusy}
                        className="text-[11px] font-bold rounded-md px-2.5 py-1.5 border border-amber-500/40 bg-amber-500/10 text-amber-400 disabled:opacity-50">
                        +{m} Ay
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {detailId && <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
