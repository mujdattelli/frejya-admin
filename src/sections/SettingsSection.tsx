import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loading, StatusMessage } from '../components/ui';

type ApiKey = { key: string; status?: string; usage_count?: number; limit?: number; [k: string]: unknown };

const normKey = (k: unknown): ApiKey =>
  typeof k === 'string' ? { key: k, status: 'active', usage_count: 0, limit: 100 } : (k as ApiKey);

type KeyHealthStatus = 'active' | 'dead' | 'invalid' | 'exhausted' | 'error' | 'checking' | 'untested';

async function testSingleKey(apiKey: string): Promise<KeyHealthStatus> {
  const trimmed = apiKey.trim();
  if (!trimmed) return 'invalid';
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': trimmed },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'p' }] }] }),
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) return 'active';
    if (res.status === 403) return 'dead';
    if (res.status === 400) return 'invalid';
    if (res.status === 429) return 'exhausted';
    return 'error';
  } catch {
    return 'error';
  }
}

const StatusBadge = ({ status, checking }: { status?: string; checking?: boolean }) => {
  if (checking) {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse shrink-0">⏳ Test Ediliyor...</span>;
  }
  if (status === 'dead') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0" title="403: Proje erişimi reddedildi veya silindi">🔴 Çalışmıyor (403)</span>;
  }
  if (status === 'invalid') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 shrink-0" title="400: API anahtarı geçersiz">🔴 Çalışmıyor (400)</span>;
  }
  if (status === 'exhausted') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 shrink-0" title="429: Günlük/dakikalık kota aşıldı">🟡 Kota Dolu</span>;
  }
  if (status === 'active') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0" title="200: Sağlıklı ve çalışıyor">🟢 Çalışıyor</span>;
  }
  if (status === 'error') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30 shrink-0" title="Bağlantı veya sunucu hatası">⚪ Ağ Hatası</span>;
  }
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/50 border border-white/10 shrink-0">⚪ Kontrol Edilmedi</span>;
};

export function SettingsSection() {
  const [freeKeys, setFreeKeys] = useState<ApiKey[]>([]);
  const [paidKeys, setPaidKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const toggleReveal = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: keys } = await supabase.from('system_settings').select('*').eq('id', 'api_keys').single();
    const k = keys as { free_keys?: unknown; paid_keys?: unknown } | null;
    setFreeKeys(Array.isArray(k?.free_keys) ? k.free_keys.map(normKey) : []);
    setPaidKeys(Array.isArray(k?.paid_keys) ? k.paid_keys.map(normKey) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const testKey = async (id: string, keyVal: string, listType: 'free' | 'paid', idx: number) => {
    setTestingKeyId(id);
    const result = await testSingleKey(keyVal);
    setTestingKeyId(null);
    if (listType === 'free') {
      setFreeKeys(prev => {
        const next = [...prev];
        if (next[idx]) next[idx] = { ...next[idx], status: result };
        return next;
      });
    } else {
      setPaidKeys(prev => {
        const next = [...prev];
        if (next[idx]) next[idx] = { ...next[idx], status: result };
        return next;
      });
    }
  };

  const testAllKeys = async () => {
    setTestingAll(true);
    setMsg('Tüm anahtarlar test ediliyor...');

    const newFree = [...freeKeys];
    for (let i = 0; i < newFree.length; i++) {
      if (newFree[i].key.trim()) {
        const res = await testSingleKey(newFree[i].key);
        newFree[i] = { ...newFree[i], status: res };
      }
    }
    setFreeKeys(newFree);

    const newPaid = [...paidKeys];
    for (let i = 0; i < newPaid.length; i++) {
      if (newPaid[i].key.trim()) {
        const res = await testSingleKey(newPaid[i].key);
        newPaid[i] = { ...newPaid[i], status: res };
      }
    }
    setPaidKeys(newPaid);
    setTestingAll(false);
    setMsg('Test tamamlandı. Durumları kalıcı kaydetmek için "Anahtarları Kaydet" butonuna basın.');
  };

  const saveKeys = async () => {
    setSaving(true); setMsg('');
    const { data, error } = await supabase.rpc('rpc_admin_save_api_keys', {
      p_free: freeKeys.filter((k) => k.key.trim() !== ''),
      p_paid: paidKeys.filter((k) => k.key.trim() !== ''),
    });
    setSaving(false);
    if (error) { setMsg('Hata: ' + error.message); return; }
    const d = data as { free_keys?: unknown; paid_keys?: unknown } | null;
    if (d) {
      setFreeKeys(Array.isArray(d.free_keys) ? d.free_keys.map(normKey) : []);
      setPaidKeys(Array.isArray(d.paid_keys) ? d.paid_keys.map(normKey) : []);
    }
    setMsg('API anahtarları başarıyla kaydedildi.');
  };

  if (loading) return <Loading />;

  const KeyList = ({ list, setList, color, label, kind }: {
    list: ApiKey[]; setList: React.Dispatch<React.SetStateAction<ApiKey[]>>; color: string; label: string; kind: 'free' | 'paid';
  }) => (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold uppercase text-xs" style={{ color }}>{label} ({list.length})</span>
        <button
          type="button"
          onClick={() => setList([...list, { key: '', status: 'active', usage_count: 0, limit: 100 }])}
          className="rounded px-2 py-0.5 text-lg leading-none"
          style={{ background: color + '22', color }}
          title="Yeni anahtar ekle"
        >+</button>
      </div>
      {list.length === 0 && <p className="text-white/40 text-xs italic">Anahtar yok.</p>}
      {list.map((k, i) => {
        const id = `${kind}-${i}`;
        const shown = revealed.has(id);
        const isChecking = testingKeyId === id;
        return (
          <div key={i} className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-1.5 mb-2 border border-white/10">
            <StatusBadge status={k.status} checking={isChecking} />
            <input
              type={shown ? 'text' : 'password'}
              autoComplete="off"
              value={k.key}
              onChange={(e) => { const n = [...list]; n[i] = { ...n[i], key: e.target.value }; setList(n); }}
              placeholder="API anahtarı"
              className="flex-1 bg-transparent text-primary font-mono text-xs outline-none py-1.5 min-w-0"
            />
            <button
              type="button"
              disabled={testingAll || isChecking || !k.key.trim()}
              onClick={() => testKey(id, k.key, kind, i)}
              className="text-emerald-400 hover:text-emerald-300 text-xs shrink-0 disabled:opacity-30 px-1"
              title="Bu anahtarı Google API ile anlık test et"
            >
              Test
            </button>
            <button
              type="button"
              onClick={() => toggleReveal(id)}
              className="text-white/50 hover:text-white text-xs shrink-0 px-1"
            >
              {shown ? 'Gizle' : 'Göster'}
            </button>
            <button
              type="button"
              onClick={() => setList(list.filter((_, x) => x !== i))}
              className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
              title="Bu anahtarı kaldır"
            >
              Sil
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <StatusMessage text={msg} />

      <div className="bg-card rounded-xl p-5 border-l-4 border-emerald-500 border-y border-r border-white/5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="font-bold text-base">Dinamik API Anahtarı Yönetimi</h3>
          <button
            type="button"
            onClick={testAllKeys}
            disabled={testingAll || saving}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            title="Listedeki tüm anahtarları test edip yanlarına durum işareti koyar"
          >
            {testingAll ? '⏳ Test Ediliyor...' : '⚡ Durumları Kontrol Et'}
          </button>
        </div>

        <KeyList list={freeKeys} setList={setFreeKeys} color="#10B981" label="Ücretsiz Anahtarlar" kind="free" />
        <KeyList list={paidKeys} setList={setPaidKeys} color="#EF4444" label="Ücretli Anahtarlar" kind="paid" />

        <button
          type="button"
          onClick={saveKeys}
          disabled={saving || testingAll}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg py-2.5 text-sm disabled:opacity-50 transition-colors"
        >
          {saving ? 'Kaydediliyor…' : 'Anahtarları Kaydet'}
        </button>
      </div>

    </div>
  );
}
