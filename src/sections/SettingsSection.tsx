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
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
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
  const [activeTab, setActiveTab] = useState<'photo' | 'agent'>('agent');
  
  // Fotoğraf Havuzu
  const [photoFreeKeys, setPhotoFreeKeys] = useState<ApiKey[]>([]);
  const [photoPaidKeys, setPhotoPaidKeys] = useState<ApiKey[]>([]);
  
  // Ajan & Arama Havuzu
  const [agentFreeKeys, setAgentFreeKeys] = useState<ApiKey[]>([]);
  const [agentPaidKeys, setAgentPaidKeys] = useState<ApiKey[]>([]);

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
    
    // Fotoğraf anahtarları
    const { data: photoData } = await supabase.from('system_settings').select('*').eq('id', 'api_keys').single();
    const pk = photoData as { free_keys?: unknown; paid_keys?: unknown } | null;
    setPhotoFreeKeys(Array.isArray(pk?.free_keys) ? pk.free_keys.map(normKey) : []);
    setPhotoPaidKeys(Array.isArray(pk?.paid_keys) ? pk.paid_keys.map(normKey) : []);

    // Ajan & Arama anahtarları
    const { data: agentData } = await supabase.from('system_settings').select('*').eq('id', 'agent_api_keys').single();
    const ak = agentData as { free_keys?: unknown; paid_keys?: unknown } | null;
    setAgentFreeKeys(Array.isArray(ak?.free_keys) ? ak.free_keys.map(normKey) : []);
    setAgentPaidKeys(Array.isArray(ak?.paid_keys) ? ak.paid_keys.map(normKey) : []);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const testKey = async (id: string, keyVal: string, listType: 'free' | 'paid', idx: number, isAgent: boolean) => {
    setTestingKeyId(id);
    const result = await testSingleKey(keyVal);
    setTestingKeyId(null);
    
    if (isAgent) {
      if (listType === 'free') {
        setAgentFreeKeys(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: result };
          return next;
        });
      } else {
        setAgentPaidKeys(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: result };
          return next;
        });
      }
    } else {
      if (listType === 'free') {
        setPhotoFreeKeys(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: result };
          return next;
        });
      } else {
        setPhotoPaidKeys(prev => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: result };
          return next;
        });
      }
    }
  };

  const testAllKeys = async (isAgent: boolean) => {
    setTestingAll(true);
    setMsg('Listedeki tüm anahtarlar test ediliyor...');

    const freeList = isAgent ? [...agentFreeKeys] : [...photoFreeKeys];
    for (let i = 0; i < freeList.length; i++) {
      if (freeList[i].key.trim()) {
        const res = await testSingleKey(freeList[i].key);
        freeList[i] = { ...freeList[i], status: res };
      }
    }
    if (isAgent) setAgentFreeKeys(freeList); else setPhotoFreeKeys(freeList);

    const paidList = isAgent ? [...agentPaidKeys] : [...photoPaidKeys];
    for (let i = 0; i < paidList.length; i++) {
      if (paidList[i].key.trim()) {
        const res = await testSingleKey(paidList[i].key);
        paidList[i] = { ...paidList[i], status: res };
      }
    }
    if (isAgent) setAgentPaidKeys(paidList); else setPhotoPaidKeys(paidList);

    setTestingAll(false);
    setMsg('Test tamamlandı. Durumları kalıcı kaydetmek için "Kaydet" butonuna basın.');
  };

  const savePhotoKeys = async () => {
    setSaving(true); setMsg('');
    const { data, error } = await supabase.rpc('rpc_admin_save_api_keys', {
      p_free: photoFreeKeys.filter((k) => k.key.trim() !== ''),
      p_paid: photoPaidKeys.filter((k) => k.key.trim() !== ''),
    });
    setSaving(false);
    if (error) { setMsg('Hata: ' + error.message); return; }
    const d = data as { free_keys?: unknown; paid_keys?: unknown } | null;
    if (d) {
      setPhotoFreeKeys(Array.isArray(d.free_keys) ? d.free_keys.map(normKey) : []);
      setPhotoPaidKeys(Array.isArray(d.paid_keys) ? d.paid_keys.map(normKey) : []);
    }
    setMsg('Fotoğraf API anahtarları başarıyla kaydedildi.');
  };

  const saveAgentKeys = async () => {
    setSaving(true); setMsg('');
    const { data, error } = await supabase.rpc('rpc_admin_save_agent_api_keys', {
      p_free: agentFreeKeys.filter((k) => k.key.trim() !== ''),
      p_paid: agentPaidKeys.filter((k) => k.key.trim() !== ''),
    });
    setSaving(false);
    if (error) { setMsg('Hata: ' + error.message); return; }
    const d = data as { free_keys?: unknown; paid_keys?: unknown } | null;
    if (d) {
      setAgentFreeKeys(Array.isArray(d.free_keys) ? d.free_keys.map(normKey) : []);
      setAgentPaidKeys(Array.isArray(d.paid_keys) ? d.paid_keys.map(normKey) : []);
    }
    setMsg('Ajan & Arama AI anahtarları başarıyla kaydedildi.');
  };

  const copyPhotoToAgent = () => {
    const existing = new Set(agentFreeKeys.map((k) => k.key.trim()));
    const toAdd = photoFreeKeys.filter((k) => k.key.trim() && !existing.has(k.key.trim()));
    if (toAdd.length === 0) {
      setMsg('Fotoğraf havuzundaki tüm anahtarlar zaten Ajan havuzunda mevcut.');
      return;
    }
    setAgentFreeKeys([...agentFreeKeys, ...toAdd.map((k) => ({ ...k, usage_count: 0, dailyUsage: 0, limit: 1050 }))]);
    setMsg(`${toAdd.length} adet Gemini anahtarı Fotoğraf havuzundan Ajan havuzuna aktarıldı. Kaydetmeyi unutmayın!`);
  };

  const copyAgentToPhoto = () => {
    const existing = new Set(photoFreeKeys.map((k) => k.key.trim()));
    const toAdd = agentFreeKeys.filter((k) => k.key.trim() && !existing.has(k.key.trim()));
    if (toAdd.length === 0) {
      setMsg('Ajan havuzundaki tüm anahtarlar zaten Fotoğraf havuzunda mevcut.');
      return;
    }
    setPhotoFreeKeys([...photoFreeKeys, ...toAdd.map((k) => ({ ...k, usage_count: 0, dailyUsage: 0, limit: 100 }))]);
    setMsg(`${toAdd.length} adet Gemini anahtarı Ajan havuzundan Fotoğraf havuzuna aktarıldı. Kaydetmeyi unutmayın!`);
  };

  if (loading) return <Loading />;

  const KeyList = ({ list, setList, color, label, kind, isAgent }: {
    list: ApiKey[]; setList: React.Dispatch<React.SetStateAction<ApiKey[]>>; color: string; label: string; kind: 'free' | 'paid'; isAgent: boolean;
  }) => {
    const [quickInput, setQuickInput] = useState('');
    const [showBulk, setShowBulk] = useState(false);
    const [bulkText, setBulkText] = useState('');

    const handleQuickAdd = () => {
      const val = quickInput.trim();
      if (!val) return;
      setList([...list, { key: val, status: 'active', usage_count: 0, limit: kind === 'free' ? 1050 : 500 }]);
      setQuickInput('');
    };

    const handleBulkAdd = () => {
      const lines = bulkText.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.length > 5);
      if (lines.length === 0) return;
      const existing = new Set(list.map(k => k.key.trim()));
      const newEntries = lines
        .filter(k => !existing.has(k))
        .map(k => ({ key: k, status: 'active', usage_count: 0, limit: kind === 'free' ? 1050 : 500 } as ApiKey));
      setList([...list, ...newEntries]);
      setBulkText('');
      setShowBulk(false);
    };

    return (
      <div className="mb-6 bg-white/[0.02] border border-white/5 rounded-xl p-4">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3 pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase text-xs tracking-wider" style={{ color }}>{label}</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/70">
              {list.length} adet
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBulk(!showBulk)}
              className="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 transition-colors flex items-center gap-1"
              title="Birden fazla anahtarı toplu yapıştır"
            >
              📋 {showBulk ? 'Toplu Yapıştırmayı Kapat' : 'Toplu Anahtar Yapıştır'}
            </button>
            <button
              type="button"
              onClick={() => setList([...list, { key: '', status: 'active', usage_count: 0, limit: kind === 'free' ? 1050 : 500 }])}
              className="rounded px-2.5 py-1 text-xs font-bold transition-all flex items-center gap-1"
              style={{ background: color + '25', color, border: `1px solid ${color}44` }}
              title="Tek tek yeni anahtar satırı ekle"
            >
              + Boş Satır Ekle
            </button>
          </div>
        </div>

        {/* Toplu Anahtar Ekleme Alanı */}
        {showBulk && (
          <div className="mb-4 p-3 bg-black/60 border border-amber-500/30 rounded-lg">
            <label className="block text-xs font-medium text-amber-200 mb-1">
              Toplu Google Gemini API Anahtarları (Her satıra bir anahtar):
            </label>
            <textarea
              rows={3}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="AIzaSyA1b2c3d4e5f6...&#10;AIzaSyX9y8z7w6v5u4..."
              className="w-full bg-black/80 border border-white/20 rounded p-2 text-xs font-mono text-white placeholder-white/30 focus:border-amber-400 outline-none"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowBulk(false)}
                className="px-3 py-1 text-xs text-white/50 hover:text-white"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleBulkAdd}
                className="px-3 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded transition-colors"
              >
                Havuza Ekle
              </button>
            </div>
          </div>
        )}

        {/* Liste Boş Durumu */}
        {list.length === 0 ? (
          <div className="border border-dashed border-white/20 rounded-xl p-5 text-center my-2 bg-black/20">
            <p className="text-white/60 text-xs mb-3">Bu havuzda henüz kayıtlı Gemini API anahtarı bulunmuyor.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setList([{ key: '', status: 'active', usage_count: 0, limit: kind === 'free' ? 1050 : 500 }])}
                className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
                style={{ background: color, color: '#000' }}
              >
                + Yeni API Anahtarı Ekle
              </button>
              <button
                type="button"
                onClick={() => setShowBulk(true)}
                className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
              >
                📋 Toplu Yapıştır
              </button>
            </div>
          </div>
        ) : (
          list.map((k, i) => {
            const id = `${isAgent ? 'agent' : 'photo'}-${kind}-${i}`;
            const shown = revealed.has(id);
            const isChecking = testingKeyId === id;
            return (
              <div key={i} className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-1.5 mb-2 border border-white/10 hover:border-white/20 transition-colors">
                <StatusBadge status={k.status} checking={isChecking} />
                <input
                  type={shown ? 'text' : 'password'}
                  autoComplete="off"
                  value={k.key}
                  onChange={(e) => { const n = [...list]; n[i] = { ...n[i], key: e.target.value }; setList(n); }}
                  placeholder="Google Gemini API anahtarı (AIzaSy...)"
                  className="flex-1 bg-transparent text-primary font-mono text-xs outline-none py-1.5 min-w-0"
                />
                <button
                  type="button"
                  disabled={testingAll || isChecking || !k.key.trim()}
                  onClick={() => testKey(id, k.key, kind, i, isAgent)}
                  className="text-emerald-400 hover:text-emerald-300 text-xs shrink-0 disabled:opacity-30 px-1 font-medium"
                  title="Bu anahtarı Google Gemini API ile test et"
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
          })
        )}

        {/* Hızlı Tekli Ekleme Çubuğu */}
        <div className="mt-3 pt-3 border-t border-white/5 flex gap-2">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(); } }}
            placeholder="Hızlı API anahtarı yapıştır (AIzaSy...)"
            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-white/30 focus:border-white/30 outline-none"
          />
          <button
            type="button"
            onClick={handleQuickAdd}
            disabled={!quickInput.trim()}
            className="px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-30 transition-all shrink-0"
            style={{ background: color, color: '#000' }}
          >
            + Ekle
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl">
      <StatusMessage text={msg} />

      {/* Google Gemini AI Bilgilendirme ve Hızlı Erişim Kartı */}
      <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-white/80 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-300 text-sm">🤖 Google Gemini API Anahtar Havuzu</span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/40">Dinamik Havuz</span>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm shrink-0"
          >
            🌐 Google AI Studio'dan Ücretsiz Key Al ↗
          </a>
        </div>
        <p className="text-[11px] text-white/70 leading-relaxed">
          Frejya'nın tüm yapay zeka özellikleri (Ajan Sohbeti, Arama Fısıltısı, Sohbet Kıvılcımı, Aura Kalemi, Profil Ajan Notu ve Fotoğraf Doğrulama) aşağıdaki Google Gemini API anahtarlarıyla çalışır. Birden fazla anahtar ekleyerek sıfır maliyetle kotasız çalışabilirsiniz.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
            <span className="font-bold text-amber-200 block mb-1">🧠 Ajan & Sohbet AI Havuzu:</span>
            <p className="text-white/60 text-[10px]">Ajan Sohbeti (mülakat), Arama Fısıltısı, Sohbet Kıvılcımı, Aura Kalemi ve 512-d Vektör embedding için kullanılır.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
            <span className="font-bold text-emerald-200 block mb-1">📷 Fotoğraf Doğrulama Havuzu:</span>
            <p className="text-white/60 text-[10px]">Kayıttaki solo insan, gerçek yüz ve biyometrik uygunluk analizi için arka plan worker'ında kullanılır.</p>
          </div>
        </div>
      </div>

      {/* Havuz Seçim Butonları */}
      <div className="flex gap-2 mb-4 bg-white/5 p-1 rounded-xl border border-white/10">
        <button
          type="button"
          onClick={() => { setActiveTab('agent'); setMsg(''); }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'agent' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'text-white/60 hover:text-white'
          }`}
        >
          <span>🧠 Ajan & Sohbet AI Havuzu (Gemini)</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full font-mono">{agentFreeKeys.length + agentPaidKeys.length}</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('photo'); setMsg(''); }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'photo' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'text-white/60 hover:text-white'
          }`}
        >
          <span>📷 Fotoğraf Doğrulama Havuzu (Gemini)</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full font-mono">{photoFreeKeys.length + photoPaidKeys.length}</span>
        </button>
      </div>

      {activeTab === 'agent' && (
        <div className="bg-card rounded-xl p-5 border-l-4 border-amber-500 border-y border-r border-white/5 mb-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-base text-amber-200">Ajan & Sohbet AI Havuzu (Gemini 1.5 Flash)</h3>
              <p className="text-white/50 text-[11px] mt-0.5">
                Ajan mülakatı, Fısıltı, Sohbet Kıvılcımı, Aura Kalemi, Profil Notu ve 512-d Vektör Arama için kullanılır.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {photoFreeKeys.length > 0 && (
                <button
                  type="button"
                  onClick={copyPhotoToAgent}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1"
                  title="Fotoğraf havuzundaki anahtarları Ajan havuzuna da ekle"
                >
                  📋 Fotoğraftan Kopyala
                </button>
              )}
              <button
                type="button"
                onClick={() => testAllKeys(true)}
                disabled={testingAll || saving}
                className="bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                title="Tüm Ajan anahtarlarını Google API ile test eder"
              >
                {testingAll ? '⏳ Test Ediliyor...' : '⚡ Durumları Kontrol Et'}
              </button>
            </div>
          </div>

          <KeyList list={agentFreeKeys} setList={setAgentFreeKeys} color="#F59E0B" label="Ücretsiz Ajan Anahtarları" kind="free" isAgent={true} />
          <KeyList list={agentPaidKeys} setList={setAgentPaidKeys} color="#EF4444" label="Ücretli Ajan Anahtarları" kind="paid" isAgent={true} />

          <button
            type="button"
            onClick={saveAgentKeys}
            disabled={saving || testingAll}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg py-2.5 text-sm disabled:opacity-50 transition-colors shadow-md"
          >
            {saving ? 'Kaydediliyor…' : 'Ajan Anahtarlarını Kaydet (MFA Korumalı)'}
          </button>
        </div>
      )}

      {activeTab === 'photo' && (
        <div className="bg-card rounded-xl p-5 border-l-4 border-emerald-500 border-y border-r border-white/5 mb-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-base text-emerald-200">Fotoğraf Doğrulama Havuzu (Gemini)</h3>
              <p className="text-white/50 text-[11px] mt-0.5">
                Kayıttaki gerçek yüz, solo insan ve çekicilik puanlama analizleri için kullanılır.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {agentFreeKeys.length > 0 && (
                <button
                  type="button"
                  onClick={copyAgentToPhoto}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1"
                  title="Ajan havuzundaki anahtarları Fotoğraf havuzuna da ekle"
                >
                  📋 Ajan Havuzundan Kopyala
                </button>
              )}
              <button
                type="button"
                onClick={() => testAllKeys(false)}
                disabled={testingAll || saving}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                title="Tüm Fotoğraf anahtarlarını test eder"
              >
                {testingAll ? '⏳ Test Ediliyor...' : '⚡ Durumları Kontrol Et'}
              </button>
            </div>
          </div>

          <KeyList list={photoFreeKeys} setList={setPhotoFreeKeys} color="#10B981" label="Ücretsiz Fotoğraf Anahtarları" kind="free" isAgent={false} />
          <KeyList list={photoPaidKeys} setList={setPhotoPaidKeys} color="#EF4444" label="Ücretli Fotoğraf Anahtarları" kind="paid" isAgent={false} />

          <button
            type="button"
            onClick={savePhotoKeys}
            disabled={saving || testingAll}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg py-2.5 text-sm disabled:opacity-50 transition-colors shadow-md"
          >
            {saving ? 'Kaydediliyor…' : 'Fotoğraf Anahtarlarını Kaydet (MFA Korumalı)'}
          </button>
        </div>
      )}

    </div>
  );
}
