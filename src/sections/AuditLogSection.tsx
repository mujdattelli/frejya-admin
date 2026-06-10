import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, EmptyState, StatusMessage } from '../components/ui';

type AuditRow = {
  id: string;
  action_type: string;
  performed_by: string | null;
  performer_name: string | null;
  target_id: string | null;
  target_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

const PAGE = 50;

const ACTION_LABELS: Record<string, string> = {
  ADMIN_REPORT_WARN: 'Şikayet → Uyarı',
  ADMIN_REPORT_BAN: 'Şikayet → Ban',
  ADMIN_REPORT_IGNORE: 'Şikayet → Yok say',
  ADMIN_REPORT_BULK_IGNORE: 'Toplu şikayet yok say',
  ADMIN_TICKET_REPLY: 'Destek talebi yanıtı',
  ADMIN_BAN: 'Ban uygulandı',
  ADMIN_UNBAN: 'Ban kaldırıldı',
  PHOTO_APPROVED: 'Fotoğraf onaylandı',
  PHOTO_REJECTED: 'Fotoğraf reddedildi',
  USER_BANNED: 'Kullanıcı banlandı',
  USER_UNBANNED: 'Kullanıcı banı kaldırıldı',
  ACCOUNT_SELF_DELETED: 'Hesap silindi (kullanıcı)',
};
const actionLabel = (a: string) => ACTION_LABELS[a] || a;

export function AuditLogSection() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('rpc_admin_list_audit_logs', { p_limit: limit, p_offset: 0 });
    setLoading(false);
    if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
    const list = (data as AuditRow[]) || [];
    setRows(list);
    setHasMore(list.length === limit);
  }, [limit]);

  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  if (loading) return <Loading />;

  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (!needle) return true;
    const hay = [
      r.action_type, actionLabel(r.action_type), r.performer_name, r.target_name,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(needle);
  });

  return (
    <div className="max-w-3xl">
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Eylem, uygulayan veya hedef isminde ara…"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        {q && (
          <button onClick={() => setQ('')}
            className="px-3 py-2 text-xs text-white/50 border border-white/10 rounded-lg hover:bg-white/5">
            Temizle
          </button>
        )}
      </div>
      <StatusMessage text={msg} />
      {rows.length === 0 ? (
        <EmptyState text="Henüz denetim kaydı yok." />
      ) : visible.length === 0 ? (
        <EmptyState text="Aramanıza uyan kayıt yok." />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((r) => (
            <div key={r.id} className="bg-card border border-white/5 rounded-xl p-3.5">
              <div className="flex justify-between items-center gap-3 mb-1">
                <span className="font-bold text-xs text-primary">{actionLabel(r.action_type)}</span>
                <span className="text-white/35 text-[10px] shrink-0">
                  {r.created_at ? new Date(r.created_at).toLocaleString('tr-TR') : '—'}
                </span>
              </div>
              <p className="text-white/60 text-[11px]">
                Uygulayan: <span className="text-white/85">{r.performer_name || r.performed_by || 'sistem'}</span>
                {r.target_name || r.target_id ? (
                  <> · Hedef: <span className="text-white/85">{r.target_name || r.target_id}</span></>
                ) : null}
              </p>
              {r.details && Object.keys(r.details).length > 0 && (
                <p className="text-white/35 text-[10px] font-mono mt-1 break-words">
                  {JSON.stringify(r.details)}
                </p>
              )}
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
