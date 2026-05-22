import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Şikayet edilen Aura gönderisinin içeriğini gösteren modal.
// Veri master/moderator-only `rpc_admin_get_post`'tan gelir.
type Post = {
  id: string;
  text: string | null;
  image_url: string | null;
  icon_sequence: unknown;
  location: string | null;
  timestamp: string | null;
  author_id: string | null;
  author_alias: string | null;
  author_occupation: string | null;
  author_name: string | null;
  author_username: string | null;
};

export function PostPreviewModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('rpc_admin_get_post', { p_post_id: postId });
      setLoading(false);
      if (error) { setMsg('Yükleme hatası: ' + error.message); return; }
      if (!data) { setMsg('Gönderi bulunamadı — silinmiş olabilir.'); return; }
      setPost(data as Post);
    })();
  }, [postId]);

  const iconCount = post && Array.isArray(post.icon_sequence) ? post.icon_sequence.length : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-md max-h-[88vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-white/10 sticky top-0 bg-card">
          <h3 className="font-bold">Şikayet Edilen Gönderi</h3>
          <button onClick={onClose} className="text-white/50 text-lg leading-none">✕</button>
        </div>

        {loading ? (
          <p className="text-white/40 text-sm p-5">Yükleniyor…</p>
        ) : !post ? (
          <p className="text-red-400 text-sm p-5">{msg || 'Gönderi yok.'}</p>
        ) : (
          <div className="p-5">
            <div className="mb-3 text-sm">
              <span className="text-white/40">Yazar: </span>
              <span className="text-white/80 font-bold">{post.author_name || post.author_alias || '—'}</span>
              {post.author_username && <span className="text-white/40"> · @{post.author_username}</span>}
            </div>
            {post.author_occupation && (
              <p className="text-white/50 text-xs mb-3">{post.author_occupation}</p>
            )}

            {post.image_url ? (
              <img src={post.image_url} alt="" className="w-full rounded-lg mb-3 max-h-72 object-cover" />
            ) : null}

            {post.text ? (
              <p className="text-white/80 text-sm bg-black/30 rounded-lg p-3 mb-3 whitespace-pre-wrap">{post.text}</p>
            ) : null}

            {iconCount > 0 && (
              <p className="text-white/50 text-xs mb-2">
                Sembolik ikon dizisi — {iconCount} ikon
                <span className="block text-white/30 text-[10px] font-mono mt-1 break-words">
                  {JSON.stringify(post.icon_sequence)}
                </span>
              </p>
            )}

            {!post.text && !post.image_url && iconCount === 0 && (
              <p className="text-white/40 text-sm mb-3 italic">Bu gönderide görüntülenecek içerik yok.</p>
            )}

            <div className="border-t border-white/5 pt-3 text-xs text-white/40">
              {post.location && <p>Konum: {post.location}</p>}
              <p>Tarih: {post.timestamp ? new Date(post.timestamp).toLocaleString('tr-TR') : '—'}</p>
              <p className="font-mono text-[10px] mt-1 break-all">ID: {post.id}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
