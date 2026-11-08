import { sumOmset, safeDiv } from '../utils.js';

export function analyzeFinancePillar(state) {
  const insights = [];
  const fRows = state.rows.filter(r => r.tt === 'F');
  const rRows = state.rows.filter(r => r.tt === 'R');
  if (!fRows.length) return insights;

  const totalGross = fRows.reduce((s, r) => s + r.amount, 0);
  const totalRet = rRows.reduce((s, r) => s + r.amount, 0);
  const totalDisc = fRows.reduce((s, r) => s + (r.disc || 0) + (r.disc1kh || 0) + (r.pro || 0), 0);

  // 41. Discount Leakage
  const discRate = safeDiv(totalDisc, totalGross) * 100;
  if (discRate > 5) {
    insights.push({
      id: 'disc-leak', category: 'Keuangan', title: `Kebocoran Diskon: Total Diskon Mencapai ${discRate.toFixed(1)}%`,
      desc: `Anda memberikan potongan harga Rp ${Math.round(totalDisc/1000000)} Jt. Ini menggerus profit bersih.`,
      severity: 'high', nonTechnicalActions: ['Evaluasi batas maksimal diskon.', 'Audit salesman yang sering memberi diskon.'], techActions: []
    });
  }

  // 43. Return Rate Anomaly
  const retRate = safeDiv(totalRet, totalGross) * 100;
  if (retRate > 3) {
    insights.push({
      id: 'ret-high', category: 'Keuangan', title: `Kebocoran Omset: Return Rate Tinggi (${retRate.toFixed(1)}%)`,
      desc: `Anda kehilangan Rp ${Math.round(totalRet/1000000)} Jt karena barang dikembalikan.`,
      severity: 'critical', nonTechnicalActions: ['Audit stok gudang.', 'Evaluasi logistik pengiriman.'], techActions: []
    });
  }

  // 42. Profit Hunter (Omset tinggi, Net rendah)
  // (Disederhanakan)

  return insights;
}