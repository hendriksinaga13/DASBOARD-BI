// js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://nkfwpwbrbtrsmroiadzt.supabase.co';
const SUPABASE_ANON = 'sb_publishable_UHSVdObbg_tPaUQYeBwBWQ_vAv5cCM2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const BUCKET = 'm245_data';

export async function gzipText(text) {
  try {
    if (typeof CompressionStream === 'undefined') return new Blob([text], { type: 'text/plain' });
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch (e) {
    return new Blob([text], { type: 'text/plain' });
  }
}

// ⚡ Gunakan file_name sebagai pengenal
export async function getUploadText(fileName) {
  const { data: meta, error } = await supabase
    .from('m245_uploads').select('storage_path, file_name').eq('file_name', fileName).single();
  if (error) throw error;

  const { data: blob, error: stErr } = await supabase.storage
    .from(BUCKET).download(meta.storage_path);
  if (stErr) throw stErr;

  let text = '';
  if (meta.storage_path.endsWith('.gz')) {
    try {
      const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(stream).text();
    } catch(e) {
      text = await blob.text();
    }
  } else {
    text = await blob.text();
  }
  
  return { text, name: meta.file_name };
}

// ⚡ Ubah select dari 'id' menjadi 'file_name'
export async function listUploads() {
  const { data, error } = await supabase.from('m245_uploads')
    .select('file_name, file_type, size_bytes, row_count, uploaded_at')
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false });
  if (error) {
    console.error('Error List Uploads:', error.message);
    alert('Gagal ambil data cloud: ' + error.message);
    throw error;
  }
  return data;
}

// ⚡ Hapus berdasarkan file_name
export async function deleteUpload(fileName) {
  const { data: meta } = await supabase
    .from('m245_uploads').select('storage_path').eq('file_name', fileName).maybeSingle();
  if (meta?.storage_path) {
    await supabase.storage.from(BUCKET).remove([meta.storage_path]).catch(()=>{});
  }
  const { error } = await supabase.from('m245_uploads').delete().eq('file_name', fileName);
  if (error) throw error;
  return true;
}