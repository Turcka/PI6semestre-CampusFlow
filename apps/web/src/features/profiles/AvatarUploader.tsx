import { useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type Props = {
  userId: string;
  currentUrl: string | null;
  name: string;
  /** Chamado com a URL pública após o upload; o pai persiste via PATCH /auth/me. */
  onUploaded: (publicUrl: string) => Promise<void> | void;
  disabled?: boolean;
};

const MAX_SIDE = 512;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/** Redimensiona para no máximo 512px (quadrado, recorte central) e exporta WebP. */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const target = Math.min(MAX_SIDE, side);

  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível neste navegador.');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter a imagem.'))), 'image/webp', 0.86);
  });
}

export function AvatarUploader({ userId, currentUrl, name, onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  async function handleFile(file: File) {
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Envie uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('Imagem muito grande (máx. 10 MB).');
      return;
    }

    setBusy(true);
    try {
      const blob = await toSquareWebp(file);
      const objectPath = `${userId}/avatar.webp`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(objectPath, blob, { upsert: true, contentType: 'image/webp', cacheControl: '60' });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(objectPath);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
      setPreview(URL.createObjectURL(blob));
      await onUploaded(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a foto.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const src = preview ?? currentUrl;

  return (
    <div className="flex items-center gap-4">
      {src ? (
        <img src={src} alt={`Foto de ${name}`} className="h-20 w-20 rounded-full object-cover ring-2 ring-slate-200" />
      ) : (
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-800">
          {initials || '?'}
        </span>
      )}
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id={`avatar-${userId}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
          disabled={disabled || busy}
        />
        <Button type="button" variant="secondary" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Enviando…' : src ? 'Trocar foto' : 'Enviar foto'}
        </Button>
        <p className="text-xs text-slate-500">JPG, PNG ou WebP. A foto é redimensionada para 512px.</p>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}
