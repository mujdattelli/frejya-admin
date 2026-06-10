import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';

type LoginIssue = {
  id: string;
  entered_username: string | null;
  device_info: string | null;
  device_id: string | null;
  detail: string;
  created_at: string;
};

export function LoginIssuesSection() {
  const [items, setItems] = useState<LoginIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('login_issue_reports')
      .select('id, entered_username, device_info, device_id, detail, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    setItems((data as LoginIssue[]) || []);
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);
  useEffect(() => {
    const ch = supabase
      .channel('admin-login-issues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'login_issue_reports' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const resolve = async (id: string) => {
    const { error } = await supabase.from('login_issue_reports').update({ status: 'resolved' }).eq('id', id);
    if (error) { setMsg('Hata: ' + error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  if (loading) return <Loading />;

  const needle = q.trim().toLowerCase();
  const visible = items.filter((it) => {
    if (!needle) return true;
    return [it.entered_username || '', it.device_info || '', it.detail].join(' ').toLowerCase().includes(needle);
  });

  return (
    <div className="max-w-2xl">
      <p className="text-white/50 text-xs mb-3">
        Giriş/kayıt/güvenlik adımında takılıp "Admine bildir" diyen kullanıcılar. (Giriş yapamadıkları
        için kullanıcı adı yanlış olabilir — cihaz bilgisiyle birlikte değerlendir.)
      </p>
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kullanıcı adı, cihaz veya detayda ara…"
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
      {items.length === 0 ? (
        <EmptyState text="Bekleyen giriş sorunu bildirimi yok." />
      ) : visible.length === 0 ? (
        <EmptyState text="Aramanıza uyan bildirim yok." />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((it) => (
            <div key={it.id} className="bg-card rounded-xl p-4 border-l-4 border-amber-500 border-y border-r border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-amber-400 font-bold text-[11px] uppercase tracking-widest">Giriş Yapamıyor</span>
                <span className="text-white/40 text-[10px]">{new Date(it.created_at).toLocaleString('tr-TR')}</span>
              </div>
              <p className="text-white/60 text-[11px] mb-1">
                Girilen kullanıcı adı: <span className="text-white/90 font-bold">{it.entered_username || '(boş)'}</span>
              </p>
              <p className="text-white/40 text-[10px] mb-2">Cihaz: {it.device_info || '(bilinmiyor)'}</p>
              <p className="text-primary text-sm italic bg-black/40 rounded-lg p-3 mb-3">"{it.detail}"</p>
              <button onClick={() => resolve(it.id)}
                className="w-full py-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-xs rounded-lg">
                Çözüldü olarak işaretle
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
