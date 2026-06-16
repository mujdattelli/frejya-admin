import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';

type DeletionRequest = {
  id: string;
  email: string;
  note: string | null;
  status: string;
  created_at: string;
  matched_user_id: string | null;
  match_exists: boolean;
  match_display_name: string | null;
};

export function DeletionRequestsSection() {
  const [items, setItems] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('rpc_admin_list_deletion_requests', { p_status: 'pending' });
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    setItems((data as DeletionRequest[]) || []);
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);

  const resolve = async (it: DeletionRequest, action: 'approve' | 'reject') => {
    if (action === 'approve') {
      const who = it.match_exists ? (it.match_display_name || it.email) : it.email;
      if (!window.confirm(`"${who}" hesabını SİLMEK üzeresin. Bu işlem 15 gün geri-alma sonrası kalıcıdır. Onaylıyor musun?`)) return;
    }
    setBusyId(it.id); setMsg('');
    const { data, error } = await supabase.rpc('rpc_admin_resolve_deletion_request', { p_id: it.id, p_action: action });
    setBusyId(null);
    if (error) { setMsg('Hata: ' + error.message); return; }
    const st = (data as { status?: string })?.status;
    if (st === 'no_match') setMsg('Bu e-postaya ait hesap bulunamadı; talep "eşleşme yok" olarak kapatıldı.');
    else if (st === 'done') setMsg('Hesap silindi (15 gün geri-alma penceresi başladı).');
    else if (st === 'rejected') setMsg('Talep reddedildi.');
    setItems((prev) => prev.filter((x) => x.id !== it.id));
  };

  if (loading) return <Loading />;

  return (
    <div className="max-w-2xl">
      <p className="text-white/50 text-xs mb-3">
        frejya.app/hesap-sil sayfasından gelen hesap silme talepleri. "Onayla & Sil" hesabı self-delete ile
        aynı şekilde siler (15 gün geri-alma + 60 gün e-posta blok). E-posta bir hesaba ait değilse "eşleşme yok" olarak kapanır.
      </p>
      <StatusMessage text={msg} />
      {items.length === 0 ? (
        <EmptyState text="Bekleyen hesap silme talebi yok." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <div key={it.id} className="bg-card rounded-xl p-4 border-l-4 border-red-500 border-y border-r border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-red-400 font-bold text-[11px] uppercase tracking-widest">Silme Talebi</span>
                <span className="text-white/40 text-[10px]">{new Date(it.created_at).toLocaleString('tr-TR')}</span>
              </div>
              <p className="text-white/60 text-[11px] mb-1">
                E-posta: <span className="text-white/90 font-bold">{it.email}</span>
              </p>
              <p className="text-[11px] mb-2">
                {it.match_exists
                  ? <span className="text-emerald-400">Eşleşen hesap: {it.match_display_name || '(isimsiz)'}</span>
                  : <span className="text-amber-400">Bu e-postaya ait hesap bulunamadı</span>}
              </p>
              {it.note && <p className="text-primary text-sm italic bg-black/40 rounded-lg p-3 mb-3">"{it.note}"</p>}
              <div className="flex gap-2">
                <button
                  disabled={busyId === it.id}
                  onClick={() => resolve(it, 'approve')}
                  className="flex-1 py-2 bg-red-500/15 border border-red-500/30 text-red-400 font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {busyId === it.id ? 'İşleniyor…' : 'Onayla & Sil'}
                </button>
                <button
                  disabled={busyId === it.id}
                  onClick={() => resolve(it, 'reject')}
                  className="px-4 py-2 border border-white/15 text-white/60 text-xs rounded-lg hover:bg-white/5 disabled:opacity-50"
                >
                  Reddet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
