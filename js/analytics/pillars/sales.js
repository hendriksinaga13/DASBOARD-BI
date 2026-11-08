import { safeDiv, sumOmset, groupSum } from '../utils.js';

export function analyzeSalesPillar(state) {
  const insights = [];
  const rows = state.rows;
  const fRows = rows.filter(r => r.tt === 'F');
  if (!fRows.length) return insights;

  const totalOmset = sumOmset(rows);
  const uniqueDays = new Set(fRows.map(r => r.day)).size;
  const dates = fRows.map(r => r.day).sort();
  const firstDate = dates[0], lastDate = dates[dates.length - 1];
  
  // 1. Predictive Run-Rate
  const totalDays = 30; // Asumsi 30 hari
  const runRate = (totalOmset / uniqueDays) * totalDays;
  insights.push({
    id: 'run-rate', category: 'Prediksi Omset', title: `Proyeksi Akhir Bulan: Rp ${Math.round(runRate/1000000)} Jt`,
    desc: `Berdasarkan kecepatan penjualan (${uniqueDays} hari aktif), AI memprediksi omset akhir bulan mencapai Rp ${Math.round(runRate/1000000)} Juta.`,
    severity: 'growth', nonTechnicalActions: ['Gunakan proyeksi ini untuk memotivasi tim.', 'Jika target belum tercapai, tambah hari kerja efektif.'], techActions: []
  });

  // 2. Gap Analysis (Target vs Realita)
  // (Disederhanakan, jika ada data target di state)
  
  // 3. Time-Series Anomaly
  const dayGroup = groupSum(fRows, r => r.day);
  if (dayGroup.length > 3) {
    const avg = totalOmset / uniqueDays;
    const worstDay = dayGroup[dayGroup.length - 1];
    if (worstDay.value < avg * 0.3) {
      insights.push({
        id: 'anomaly-day', category: 'Anomali Penjualan', title: `Anomali: Penjualan Drop di Tanggal ${worstDay.label}`,
        desc: `Omset di tanggal tersebut hanya Rp ${Math.round(worstDay.value/1000)}rb, sangat jauh di bawah rata-rata harian.`,
        severity: 'high', nonTechnicalActions: ['Cek apakah ada salesman yang tidak masuk hari itu atau kendala logistik.'], techActions: []
      });
    }
  }

  // 4. Hari Kerja Efektif
  if (uniqueDays < 15) {
    insights.push({
      id: 'low-work-days', category: 'Efektivitas Waktu', title: `Hari Kerja Sangat Sedikit (${uniqueDays} Hari)`,
      desc: `Dalam periode filter ini, transaksi hanya terjadi di ${uniqueDays} hari. Ada indikasi tim tidak bekerja maksimal.`,
      severity: 'medium', nonTechnicalActions: ['Lakukan evaluasi kehadiran tim.', 'Targetkan minimal 22 hari kerja aktif.'], techActions: []
    });
  }

  // 5. End-of-Month Rush
  const lastDayOmset = dayGroup[dayGroup.length - 1]?.value || 0;
  if (safeDiv(lastDayOmset, totalOmset) > 0.3) {
    insights.push({
      id: 'month-rush', category: 'Perilaku Penjualan', title: `Fenomena "Kejar Tayang" di Akhir Periode`,
      desc: `Lebih dari 30% omset terjadi di hari terakhir. Ini menandakan tim "menahan" orderan di awal bulan.`,
      severity: 'high', nonTechnicalActions: ['Pecah target mingguan agar orderan merata.'], techActions: []
    });
  }

  return insights;
}