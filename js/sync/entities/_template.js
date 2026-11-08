// js/sync/entities/_template.js
import { supabase } from '../../supabase.js';

export default {
  // ── 4 INFO INTI (UBAH INI SAJA) ──
  name: 'modul_baru',             // contoh: 'programs'
  table: 'm245_modul_baru',       // contoh: 'm245_programs'
  pk: 'key',                      // Primary key di Supabase
  stateKey: 'modulBaru',          // Nama variabel di store.state
  stateType: 'Object',            // 'Object' | 'Map' | 'Array'

  // ── METHOD STANDAR (JANGAN DIUBAH) ──
  async upsert(op) {
    const { error } = await supabase.from(this.table).upsert({
      [this.pk]: op.key,
      data: op.data,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }, { onConflict: this.pk });
    if (error) throw error;
  },

  async remove(op) {
    const { error } = await supabase.from(this.table)
      .update({ deleted_at: new Date().toISOString() })
      .eq(this.pk, op.key);
    if (error) throw error;
  },

  async pull() {
    const { data } = await supabase.from(this.table)
      .select(`${this.pk}, data`)
      .is('deleted_at', null);

    if (this.stateType === 'Map') {
      const m = new Map();
      for (const row of data || []) m.set(row[this.pk], row.data);
      return m;
    }
    if (this.stateType === 'Array') {
      return (data || []).map(row => ({ ...row.data, name: row[this.pk] }));
    }
    const obj = {};
    for (const row of data || []) obj[row[this.pk]] = row.data;
    return obj;
  }
};