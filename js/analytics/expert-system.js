import { compactRp, NF1 } from '../core/utils.js';

export function generateExpertInsights(state, agg, rawInsights) {
  const expert = [];
  
  if (!state.rows || state.rows.length === 0) return expert;
  
  if (agg.lines < 30) {
    expert.push({ id: 'insufficient-data', category: 'Data Quality', severity: 'high', title: 'Data Tidak Cukup', desc: `Sistem hanya menemukan ${agg.lines} baris data. Analisis AI membutuhkan minimal 30 baris transaksi.`, techActions: ['Hapus filter atau unggah data lebih lengkap.'], nonTechnicalActions: ['Minta admin data melengkapi data transaksi minimal 1 bulan penuh.'], actionData: null });
    return expert;
  }

  // Loop semua hasil detektor mentah dan ubah ke format Expert System
  rawInsights.forEach(raw => {
    expert.push({
      id: raw.id,
      category: raw.category || 'General',
      severity: raw.severity || 'info',
      title: raw.title || 'Temuan Analisis',
      desc: raw.desc || 'Terdapat pola yang perlu diperhatikan.',
      techActions: raw.techActions || ['Buka menu terkait untuk detail.'],
      nonTechnicalActions: raw.nonTechnicalActions || ['Lakukan evaluasi operasional.'],
      actionData: raw.actionData || null
    });
  });

  if (expert.length === 0) {
    expert.push({
      id: 'healthy-business', category: 'General', severity: 'growth',
      title: 'Kinerja Bisnis Optimal',
      desc: `Dari ${agg.lines.toLocaleString('id-ID')} baris data yang dianalisis, tidak ditemukan anomali kritikal.`,
      techActions: ['Lanjutkan pemantauan rutin.'],
      nonTechnicalActions: ['Berikan apresiasi kepada seluruh tim atas kinerja yang stabil.']
    });
  }

  return expert;
}