// js/sync/entities/outlets.js
import { supabase } from '../../supabase.js';

export default {
  name: 'outlets',
  table: 'm245_outlets',   // ⚡ Tabel Outlet
  pk: 'outlet_key',
  stateKey: 'outletMaster',// ⚡ Masuk ke store.state.outletMaster
  stateType: 'Map',        // ⚡ Outlet menggunakan Map

  async upsert(op) {
    const { error } = await supabase.from(this.table).upsert({
      [this.pk]: op.key,
      outlet_no: String(op.data.outletNo || '').trim(),
      outlet:    String(op.data.outlet || '').trim(),
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
      .select(`${this.pk}, data`).is('deleted_at', null);
    const m = new Map();
    for (const row of data || []) m.set(row[this.pk], row.data);
    return m;
  }
};