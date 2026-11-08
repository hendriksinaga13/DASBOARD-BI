import { sumOmset, groupSum } from '../utils.js';

export function analyzeSdmPillar(state) {
  const insights = [];
  const fRows = state.rows.filter(r => r.tt === 'F');
  if (!fRows.length) return insights;

  const totalOmset = sumOmset(fRows);
  const smGroup = groupSum(fRows, r => r.salesman);

  // 11. Pareto Salesman
  if (smGroup.length > 3) {
    const top20 = smGroup.slice(0, Math.ceil(smGroup.length * 0.2));
    const topShare = (top20.reduce((s, g) => s + g.value, 0) / totalOmset) * 100;
    if (topShare > 60) {
      insights.push({
        id: 'pareto-sm', category: 'Manajemen SDM', title: `Bahaya Ketergantungan: ${topShare.toFixed(0)}% Omset dari Top 20% Salesman`,
        desc: `Bisnis Anda sangat bergantung pada segelintir orang. Jika mereka resign, omset bisa lumpuh.`,
        severity: 'high', nonTechnicalActions: ['Lakukan program mentoring (buddy system).', 'Siapkan bonus retensi khusus.'], techActions: ['Buka Leaderboard.']
      });
    }
  }

  // 12. Salesman Zombie (Banyak kunjungan, minim omset)
  const smInvoices = new Map();
  fRows.forEach(r => {
    if (!smInvoices.has(r.salesman)) smInvoices.set(r.salesman, new Set());
    smInvoices.get(r.salesman).add(r.invoice);
  });
  const bottomSm = smGroup[smGroup.length - 1];
  if (bottomSm) {
    const invCount = smInvoices.get(bottomSm.label)?.size || 0;
    if (invCount > 10 && bottomSm.value < (totalOmset / smGroup.length) * 0.3) {
      insights.push({
        id: 'zombie-sm', category: 'Manajemen SDM', title: `Salesman "Zombie": Banyak Kunjungan, Minim Omset`,
        desc: `Salesman "${bottomSm.label}" memiliki ${invCount} faktur, tapi omsetnya sangat kecil. Efektivitas kerjanya rendah.`,
        severity: 'medium', nonTechnicalActions: ['Lakukan pelatihan teknik closing (hard selling).', 'Evaluasi apakah area kerjanya terlalu kecil.'], techActions: []
      });
    }
  }

  // 13. Return Abuse
  const rRows = state.rows.filter(r => r.tt === 'R');
  if (rRows.length > 0) {
    const smReturns = groupSum(rRows, r => r.salesman);
    const worstRet = smReturns[0];
    if (worstRet && worstRet.value > (sumOmset(rRows) * 0.4)) {
      insights.push({
        id: 'return-abuse', category: 'Audit Internal', title: `Anomali Retur: Salesman "${worstRet.label}" Mendominasi`,
        desc: `Salesman ini menyumbang porsi retur terbesar. Indikasi jual paksa (forcing) atau salah input.`,
        severity: 'critical', nonTechnicalActions: ['Panggil salesman untuk mintai keterangan.', 'Audit faktur returnya.'], techActions: []
      });
    }
  }

  return insights;
}