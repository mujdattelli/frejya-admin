import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserDetailModal } from '../components/UserDetailModal';
import { StatusMessage } from '../components/ui';


type RoleUser = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  isPremium: boolean;
  premiumUntil: number | null;
  isPhoneVerified: boolean;
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
      email: u.email || '',
      role: u.role || 'user',
      isPremium: !!u.is_premium,
      premiumUntil: u.premium_until ?? null,
      isPhoneVerified: !!u.is_phone_verified,
    }));
    setUsers(rows);
    if (rows.length === 0) setMsg('Sonuç yok.');
  };

  const ROLE_DESC: Record<string, string> = {
    user: 'Normal kullanıcı — yönetim paneli erişimi yok.',
    moderator: 'Yalnız moderasyon sekmeleri (foto onayı, şikayet, ban, istekler).',
    reviewer: 'Test/inceleme hesabı — AI foto onayını bypass eder (App Store review).',
    master: 'Tüm yönetim paneline + hassas işlemlere (premium/rol/API key) erişir.',
  };
  const changeRole = async (u: RoleUser, newRole: string) => {
    if (!newRole || newRole === u.role) return;
    const ok = window.confirm(
      `"${u.displayName}" rolü → ${roleLabel(newRole)}\n\n${ROLE_DESC[newRole] || ''}`
    );
    if (!ok) return;
    setBusy(u.id);
    const { error } = await supabase.rpc('rpc_set_user_role', { p_target_id: u.id, p_role: newRole });
    setBusy(null);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
    setMsg(`${u.displayName} → ${roleLabel(newRole)}`);
  };

  const applyVerified = async (u: RoleUser, makeVerified: boolean) => {
    const ok = window.confirm(
      `"${u.displayName}" → ${makeVerified ? 'ONAYLI (mavi tik)' : 'Onaylı KALDIRILACAK'}\n\n` +
        (makeVerified
          ? 'Bu kullanıcı doğrulanmış katmanına geçecek (zil 7/gün, mavi tik rozet).'
          : 'Bu kullanıcının onaylı durumu sıfırlanacak; normal kullanıcı katmanına düşecek.')
    );
    if (!ok) return;
    setBusy(u.id);
    const { error } = await supabase.rpc('rpc_admin_set_verified', {
      p_target_id: u.id,
      p_verified: makeVerified,
    });
    setBusy(null);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isPhoneVerified: makeVerified } : x)));
    setMsg(`${u.displayName} → ${makeVerified ? 'Onaylı verildi' : 'Onaylı kaldırıldı'}.`);
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
          placeholder="Mail adresine göre ara (kısmi de olur)…"
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
                  <p className="font-bold text-sm truncate">{u.email || '(mail yok)'}</p>
                  <p className="text-[11px] mt-0.5 text-white/55 truncate">
                    {u.displayName}
                  </p>
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
                  <select
                    value={u.role}
                    disabled={rowBusy}
                    onChange={(e) => changeRole(u, e.target.value)}
                    title="Rol değiştir"
                    className="text-xs font-bold rounded-lg px-2 py-2 border border-white/15 bg-black/40 text-white/80 outline-none focus:border-primary/50 disabled:opacity-50"
                  >
                    <option value="user">Normal Kullanıcı</option>
                    <option value="moderator">Moderatör</option>
                    <option value="reviewer">Test (Reviewer)</option>
                    <option value="master">Admin (Master)</option>
                  </select>
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

              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-white/5">
                <p className={`text-[11px] ${u.isPhoneVerified ? 'text-blue-400' : 'text-white/40'}`}>
                  {u.isPhoneVerified ? 'Onaylı (mavi tik)' : 'Onaylı değil'}
                </p>
                <div className="flex gap-1.5 shrink-0">
                  {u.isPhoneVerified ? (
                    <button onClick={() => applyVerified(u, false)} disabled={rowBusy}
                      className="text-[11px] font-bold rounded-md px-2.5 py-1.5 border border-red-500/40 bg-red-500/10 text-red-400 disabled:opacity-50">
                      Onaylıyı Kaldır
                    </button>
                  ) : (
                    <button onClick={() => applyVerified(u, true)} disabled={rowBusy}
                      className="text-[11px] font-bold rounded-md px-2.5 py-1.5 border border-blue-500/40 bg-blue-500/10 text-blue-400 disabled:opacity-50">
                      Onaylı Yap
                    </button>
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
