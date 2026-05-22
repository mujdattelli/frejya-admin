import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserDetailModal } from '../components/UserDetailModal';

// Fotoğraf Onayı — AI/manuel onay bekleyen profil fotoğrafları.
type PendingPhoto = {
  id: string;
  display_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  profile_picture_status: string;
  photo_rejection_count: number | null;
  last_photo_update_timestamp: number | null;
  created_at: string | null;
};

export function PhotosSection() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  // Foto-moderasyon kolonları private_users'da; ayrıca RLS admin'in başka
  // kullanıcının satırını güncellemesine izin vermez. Liste + karar bu yüzden
  // master-only SECURITY DEFINER RPC'ler üzerinden yapılır.
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('rpc_admin_list_pending_photos');
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    setPhotos((data as PendingPhoto[]) || []);
  };

  useEffect(() => {
    load();
    // Realtime: bir foto onaylanır/reddedilir veya yeni PENDING gelirse listeyi
    // F5 olmadan tazele. Tek admin senaryosunda bile karar verince diğer
    // sekmeye geçmeden ekranın canlı kalması için.
    const channel = supabase
      .channel('admin-photos-section')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'public_profiles' },
        () => load())
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'public_profiles' },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const decide = async (p: PendingPhoto, isApproved: boolean) => {
    if (!isApproved && !window.confirm('Bu fotoğraf reddedilsin mi?')) return;
    setBusy(p.id); setMsg('');
    try {
      const { data, error } = await supabase.rpc('rpc_admin_decide_photo', {
        p_user_id: p.id,
        p_approved: isApproved,
      });
      if (error) { setMsg('Hata: ' + error.message); setBusy(null); return; }
      const result = (data as { rejection_count: number; locked: boolean }) || { rejection_count: 0, locked: false };

      try {
        await supabase.rpc('rpc_log_audit_event', {
          p_action_type: isApproved ? 'PHOTO_APPROVED' : 'PHOTO_REJECTED',
          p_target_id: p.id,
          p_details: { evaluator: 'ADMIN', rejection_count: result.rejection_count, locked: result.locked },
        });
      } catch { /* audit log opsiyonel — ana işlemi bozmaz */ }

      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      setMsg(isApproved ? 'Fotoğraf onaylandı.' : 'Fotoğraf reddedildi.');
    } catch (e: any) {
      setMsg('İşlem başarısız: ' + (e?.message || ''));
    }
    setBusy(null);
  };

  if (loading) return <p className="text-white/40 text-sm">Yükleniyor…</p>;

  return (
    <div>
      {msg && <p className="text-white/50 text-xs mb-4">{msg}</p>}
      {photos.length === 0 ? (
        <p className="text-white/40 text-sm">Onay bekleyen fotoğraf yok.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((p) => {
            const waitMs = Date.now() - new Date(p.last_photo_update_timestamp || p.created_at || Date.now()).getTime();
            const waitMins = Math.floor(waitMs / 60000);
            const stuck = waitMins >= 3;
            return (
              <div key={p.id} className={`bg-card rounded-xl p-3 border ${stuck ? 'border-red-500/60' : 'border-white/5'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white/50 text-[11px]">
                    {p.profile_picture_status === 'needs_manual_review' ? 'Manuel Onay' : 'AI Bekliyor'}
                  </span>
                  <span className={`text-[11px] font-bold ${stuck ? 'text-red-400' : waitMins >= 1 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {waitMins}dk
                  </span>
                </div>
                {p.profile_picture_url ? (
                  <img src={p.profile_picture_url} alt="" className="w-full h-40 object-cover rounded-lg mb-2" />
                ) : (
                  <div className="w-full h-40 rounded-lg mb-2 bg-black/40 flex items-center justify-center text-white/30 text-xs">foto yok</div>
                )}
                <p className="text-white/80 text-xs font-bold truncate">{p.display_name || '—'}</p>
                <button
                  onClick={() => setDetailId(p.id)}
                  className="text-primary text-[10px] mb-2 underline truncate block max-w-full"
                >
                  @{p.username || p.id.slice(0, 8)} · Detay
                </button>
                <div className="flex gap-2">
                  <button onClick={() => decide(p, false)} disabled={busy === p.id}
                    className="flex-1 py-2 bg-red-500/10 text-red-400 font-bold text-[11px] rounded-lg disabled:opacity-50">
                    Reddet
                  </button>
                  <button onClick={() => decide(p, true)} disabled={busy === p.id}
                    className="flex-1 py-2 bg-emerald-500/10 text-emerald-400 font-bold text-[11px] rounded-lg disabled:opacity-50">
                    Onayla
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailId && <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
