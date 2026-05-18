import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Fotoğraf Onayı — AI/manuel onay bekleyen profil fotoğrafları.
type PendingPhoto = {
  id: string;
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

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('public_profiles')
      .select('id, profile_picture_url, profile_picture_status, photo_rejection_count, last_photo_update_timestamp, created_at')
      .in('profile_picture_status', ['PENDING', 'needs_manual_review'])
      .order('created_at', { ascending: false })
      .limit(60);
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    setPhotos((data as PendingPhoto[]) || []);
  };

  useEffect(() => { load(); }, []);

  const decide = async (p: PendingPhoto, isApproved: boolean) => {
    if (!isApproved && !window.confirm('Bu fotoğraf reddedilsin mi?')) return;
    setBusy(p.id); setMsg('');
    try {
      let rejCount = p.photo_rejection_count || 0;
      const updateData: Record<string, unknown> = {
        profile_picture_status: isApproved ? 'APPROVED' : 'REJECTED',
        last_photo_update_timestamp: Date.now(),
        evaluated_by: 'ADMIN',
        evaluated_at: new Date().toISOString(),
      };
      if (isApproved) {
        updateData.attractiveness_level = 7;
        updateData.photo_rejection_count = 0;
        updateData.banned_until = null;
      } else {
        rejCount += 1;
        updateData.photo_rejection_count = rejCount;
        if (rejCount >= 5) updateData.banned_until = Date.now() + 7 * 24 * 60 * 60 * 1000;
      }
      const { error } = await supabase.from('public_profiles').update(updateData).eq('id', p.id);
      if (error) { setMsg('Hata: ' + error.message); setBusy(null); return; }

      try {
        await supabase.rpc('rpc_log_audit_event', {
          p_action_type: isApproved ? 'PHOTO_APPROVED' : 'PHOTO_REJECTED',
          p_target_id: p.id,
          p_details: { evaluator: 'ADMIN', rejection_count: isApproved ? 0 : rejCount, locked: !isApproved && rejCount >= 5 },
        });
      } catch { /* audit log opsiyonel — ana işlemi bozmaz */ }

      await supabase.from('system_notifications').insert(
        isApproved
          ? { user_id: p.id, title: '🎉 Profiliniz Onaylandı!', message: 'Aramıza hoş geldiniz! Hemen keşfetmeye başlayabilirsiniz.', is_read: false }
          : { user_id: p.id, title: '⚠️ Fotoğrafınız Reddedildi', message: rejCount >= 5 ? '1 hafta boyunca hesabınız kilitlendi.' : `Kurallara uygun değil. Kalan Hakkınız: ${5 - rejCount}`, is_read: false }
      );

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
                <p className="text-white/30 text-[10px] mb-3 font-mono truncate">User: {p.id.slice(0, 12)}…</p>
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
    </div>
  );
}
