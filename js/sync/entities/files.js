// js/sync/entities/files.js
import { supabase, BUCKET } from '../../supabase.js';

export default {
  name: 'files',
  table: 'm245_uploads',
  pk: 'file_name',
  stateKey: 'files',
  stateType: 'Array',
  pull: false, 

  async upsert(op) {
    const { key, data } = op;
    const { name, size, type, rowCount, text, hash } = data;
    
    // Path tanpa gzip
    const path = `${hash.replace(/[^a-z0-9]/gi,'_')}.txt`;
    
    console.log('Mengirim file ke Storage:', path);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(
      path, 
      new Blob([text], { type: 'text/plain' }), 
      { upsert: true, contentType: 'text/plain' }
    );
    if (upErr) throw upErr;

    console.log('Menyimpan metadata ke DB:', name);
    const { error: dbErr } = await supabase.from('m245_uploads').upsert({
      file_name: name, 
      file_type: type, 
      size_bytes: size,
      row_count: rowCount, 
      storage_path: path,
      uploaded_at: new Date().toISOString(), 
      deleted_at: null,
    }, { onConflict: 'file_name' });
    
    if (dbErr) throw dbErr;
  },

  async remove(op) {
    const { key } = op;
    const { data: meta } = await supabase
      .from('m245_uploads').select('storage_path').eq('file_name', key).maybeSingle();
    if (meta?.storage_path) {
      await supabase.storage.from(BUCKET).remove([meta.storage_path]).catch(()=>{});
    }
    const { error } = await supabase.from('m245_uploads').delete().eq('file_name', key);
    if (error) throw error;
  }
};