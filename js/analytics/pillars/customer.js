import { sumOmset, groupSum, safeDiv } from '../utils.js';
import { selectMasterCount } from '../../core/selectors.js'; // ⚡ TAMBAHAN: Filtered count

export function analyzeCustomerPillar(state) {
  const insights = [];
  const fRows = state.rows.filter(r => r.tt === 'F');
  if (!fRows.length) return insights;

  const totalOmset = sumOmset(fRows);
  const outGroup = groupSum(fRows, r => r.outlet);

  // ═══════════════════════════════════════════════════════════════
  // 31. Risiko Paus Besar
  // ═══════════════════════════════════════════════════════════════
  if (outGroup.length > 10) {
    const top10 = outGroup.slice(0, Math.ceil(outGroup.length * 0.1));
    const topShare = safeDiv(top10.reduce((s, g) => s + g.value, 0), totalOmset) * 100;
    if (topShare > 50) {
      insights.push({
        id: 'whale-risk', 
        category: 'Manajemen Pelanggan', 
        title: `Risiko "Paus Besar": 10% Toko Menyumbang ${topShare.toFixed(0)}% Omset`,
        desc: `Bisnis bergantung pada sedikit toko raksasa. Jika mereka pindah, omset anjlok.`,
        severity: 'high', 
        nonTechnicalActions: ['Beri layanan VIP (prioritas pengiriman).', 'Management visit ke toko tersebut.'], 
        techActions: []
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 32. Toko Mati (Dorman) - ⚡ DIPERBAIKI
  // ═══════════════════════════════════════════════════════════════
  if (state.outletMaster && state.outletMaster.size > 0) {
    // ⚡ GUNAKAN FILTERED MASTER COUNT (bukan total DMP)
    const totalMaster = selectMasterCount(state);
    if (totalMaster === 0) return insights;
    
    const activeOutlets = new Set(fRows.map(r => r.outletKey)).size;
    const dormantCount = totalMaster - activeOutlets;
    const dormantRate = safeDiv(dormantCount, totalMaster) * 100;
    
    if (dormantRate > 30) {
      insights.push({
        id: 'dormant', 
        category: 'Ekspansi Pasar', 
        title: `${dormantRate.toFixed(0)}% Toko Belum Transaksi (${dormantCount} dari ${totalMaster})`,
        desc: `Ada ${dormantCount} dari ${totalMaster} toko pada filter ini yang sama sekali tidak bertransaksi di periode ini.`,
        severity: 'high', 
        nonTechnicalActions: ['Adakan program Reaktivasi (diskon khusus).', 'Suruh sales mendatangi kembali.'], 
        techActions: ['Buka menu Belum Transaksi.']
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 33. Geo-Concentration
  // ═══════════════════════════════════════════════════════════════
  const geoGroup = groupSum(fRows, r => r.kabupaten);
  if (geoGroup.length > 0) {
    const topGeoShare = safeDiv(geoGroup[0].value, totalOmset) * 100;
    if (topGeoShare > 70) {
      insights.push({
        id: 'geo-risk', 
        category: 'Ekspansi Wilayah', 
        title: `Terlalu Terpusat: ${topGeoShare.toFixed(0)}% Omset Hanya dari Kab. ${geoGroup[0].label}`,
        desc: `Penjualan menumpuk di satu wilayah. Rentan jika kompetitor masuk.`,
        severity: 'medium', 
        nonTechnicalActions: ['Lakukan ekspansi ke kabupaten sebelah.'], 
        techActions: []
      });
    }
  }

  return insights;
}