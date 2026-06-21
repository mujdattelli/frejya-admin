import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Detail = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  gender?: string | null;
  birth_year?: number | null;
  city?: string | null;
  country?: string | null;
  profession?: string | null;
  bio?: string | null;
  profile_picture_url?: string | null;
  profile_picture_status?: string | null;
  is_premium?: boolean | null;
  premium_until?: number | null;
  is_verified?: boolean | null;
  global_score?: number | null;
  created_at?: string | null;
  role?: string | null;
  is_banned?: boolean | null;
  banned_until?: number | null;
  warning_count?: number | null;
  photo_rejection_count?: number | null;
  ai_rejection_reason?: string | null;
  follower_count?: number | null;
  following_count?: number | null;
  legal_hold?: boolean | null;
  legal_hold_reason?: string | null;
  legal_hold_set_at?: string | null;
};

export function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('rpc_admin_user_detail', { p_user_id: userId });
      setLoading(false);
      if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
      setD(data as Detail);
    })();
  }, [userId]);

  const toggleBan = async () => {
    if (!d) return;
    const willBan = !d.is_banned;
    if (!window.confirm(`"${d.display_name || d.username}" ${willBan ? 'BANLANSIN' : 'banı KALDIRILSIN'} mı?`)) return;
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('rpc_admin_set_ban', { p_target_id: d.id, p_banned: willBan });
    setBusy(false);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setD({ ...d, is_banned: willBan });
    setMsg(willBan ? 'Kullanıcı banlandı.' : 'Ban kaldırıldı.');
  };

  const toggleLegalHold = async () => {
    if (!d) return;
    const willHold = !d.legal_hold;
    let reason: string | null = null;
    if (willHold) {
      reason = (window.prompt('Adli saklama sebebi (zorunlu — mahkeme/savcılık dosya no vb.):') || '').trim();
      if (!reason) { setMsg('Sebep zorunlu — işlem iptal edildi.'); return; }
    } else if (!window.confirm('Adli saklamayı KALDIR? Hesap silme-bekleyen durumdaysa verisi (yüz fotoğrafı dahil) KALICI silinir.')) {
      return;
    }
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('rpc_set_legal_hold', { p_target_id: d.id, p_on: willHold, p_reason: reason });
    setBusy(false);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setD({ ...d, legal_hold: willHold, legal_hold_reason: willHold ? reason : null, legal_hold_set_at: willHold ? new Date().toISOString() : null });
    setMsg(willHold ? 'Adli saklama AÇILDI.' : 'Adli saklama kaldırıldı.');
  };

  const Row = ({ k, v }: { k: string; v: unknown }) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-white/5 text-sm">
      <span className="text-white/40">{k}</span>
      <span className="text-white/80 text-right">{v != null && v !== '' ? String(v) : '—'}</span>
    </div>
  );

  const age = d?.birth_year ? new Date().getFullYear() - d.birth_year : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md max-h-[88vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-white/10 sticky top-0 bg-card">
          <h3 className="font-bold">Kullanıcı Detayı</h3>
          <button onClick={onClose} className="text-white/50 text-lg leading-none">✕</button>
        </div>

        {loading ? (
          <p className="text-white/40 text-sm p-5">Yükleniyor…</p>
        ) : !d ? (
          <p className="text-red-400 text-sm p-5">{msg || 'Kullanıcı bulunamadı.'}</p>
        ) : (
          <div className="p-5">
            {msg && <p className="text-white/50 text-xs mb-3">{msg}</p>}
            <div className="flex items-center gap-3 mb-4">
              {d.profile_picture_url && d.profile_picture_status === 'APPROVED' ? (
                <img src={d.profile_picture_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-black/40 flex items-center justify-center text-white/30 text-[10px]">
                  foto yok
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold truncate">{d.display_name || '—'}</p>
                <p className="text-white/40 text-xs truncate">@{d.username || '—'}</p>
                {d.is_banned && <span className="inline-block mt-1 text-[10px] font-bold text-red-400 border border-red-500/40 rounded px-1.5 py-0.5">BANLI</span>}
                {d.legal_hold && <span className="inline-block mt-1 ml-1 text-[10px] font-bold text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5">⚖️ ADLİ SAKLAMA</span>}
              </div>
            </div>

            <div className="mb-4">
              <Row k="Rol" v={d.role} />
              <Row k="Yaş" v={age} />
              <Row k="Cinsiyet" v={d.gender} />
              <Row k="Konum" v={[d.city, d.country].filter(Boolean).join(', ')} />
              <Row k="Meslek" v={d.profession} />
              <Row k="Fotoğraf durumu" v={d.profile_picture_status} />
              <Row k="Uyarı sayısı" v={d.warning_count ?? 0} />
              <Row k="Foto red sayısı" v={d.photo_rejection_count ?? 0} />
              <Row k="Premium" v={d.is_premium ? 'Evet' : 'Hayır'} />
              <Row k="Global skor" v={d.global_score} />
              <Row k="Takipçi / Takip" v={`${d.follower_count ?? 0} / ${d.following_count ?? 0}`} />
              <Row k="Kayıt" v={d.created_at ? new Date(d.created_at).toLocaleDateString('tr-TR') : null} />
            </div>

            {d.bio && (
              <p className="text-white/60 text-xs italic bg-black/30 rounded-lg p-3 mb-4">"{d.bio}"</p>
            )}

            {d.role !== 'master' && d.role !== 'moderator' && (
              <button
                onClick={toggleBan}
                disabled={busy}
                className={`w-full py-2.5 rounded-lg font-bold text-sm border disabled:opacity-50 ${
                  d.is_banned
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/40 bg-red-500/10 text-red-400'
                }`}
              >
                {busy ? '…' : d.is_banned ? 'Banı Kaldır' : 'Kullanıcıyı Banla'}
              </button>
            )}

            {d.role !== 'master' && (
              <button
                onClick={toggleLegalHold}
                disabled={busy}
                className={`w-full mt-2 py-2.5 rounded-lg font-bold text-sm border disabled:opacity-50 ${
                  d.legal_hold
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                    : 'border-white/15 bg-white/5 text-white/70'
                }`}
              >
                {busy ? '…' : d.legal_hold ? '⚖️ Adli Saklamayı Kaldır' : '⚖️ Adli Saklamaya Al'}
              </button>
            )}
            {d.legal_hold && d.legal_hold_reason && (
              <p className="text-amber-300/70 text-[11px] mt-2">
                Sebep: {d.legal_hold_reason}
                {d.legal_hold_set_at ? ` · ${new Date(d.legal_hold_set_at).toLocaleDateString('tr-TR')}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
