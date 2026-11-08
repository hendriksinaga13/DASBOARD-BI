// js/sync/entities/settings.js
import { supabase } from '../../supabase.js';

export default {
  name: 'settings',
  table: 'm245_settings',
  pk: 'key',
  stateKey: 'settings',
  stateType: 'Object',

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
      .select(`${this.pk}, data`).is('deleted_at', null);
    const obj = {};
    for (const row of data || []) obj[row[this.pk]] = row.data;
    return obj;
  }
};