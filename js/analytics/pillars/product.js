import { sumOmset, groupSum, safeDiv } from '../utils.js';

export function analyzeProductPillar(state) {
  const insights = [];
  const fRows = state.rows.filter(r => r.tt === 'F');
  if (!fRows.length) return insights;

  const totalOmset = sumOmset(fRows);
  const prodGroup = groupSum(fRows, r => r.product);

  // 21. Hero Product Syndrome
  if (prodGroup.length > 0) {
    const topProd = prodGroup[0];
    const share = safeDiv(topProd.value, totalOmset) * 100;
    if (share > 40) {
      insights.push({
        id: 'hero-product', category: 'Strategi Portofolio', title: `Hero Product Syndrome: ${share.toFixed(0)}% Omset dari 1 Produk`,
        desc: `Produk "${topProd.label}" mendominasi. Berisiko jika kompetitor meluncurkan produk serupa.`,
        severity: 'high', nonTechnicalActions: ['Buat program Bundling dengan produk lain.', 'Dorong 2-3 produk baru.'], techActions: ['Buka Basket Analysis.']
      });
    }
  }

  // 22. Subrand Imbalance
  const subGroup = groupSum(fRows, r => r.subbrand);
  if (subGroup.length > 1) {
    const topSubShare = safeDiv(subGroup[0].value, totalOmset) * 100;
    if (topSubShare > 80) {
      insights.push({
        id: 'subrand-imbalance', category: 'Strategi Portofolio', title: `Ketimpangan Subrand: "${subGroup[0].label}" Mendominasi`,
        desc: `Hampir seluruh omset datang dari subrand ini. Subrand lain hampir tidak bergerak.`,
        severity: 'medium', nonTechnicalActions: ['Buat promo silang antar subrand.', 'Evaluasi subrand yang tidak laku.'], techActions: []
      });
    }
  }

  // 23. Dead Stock (Produk tidak laku di filter ini)
  const allPcodes = new Set(state.rows.map(r => r.pcode));
  const soldPcodes = new Set(fRows.map(r => r.pcode));
  if (allPcodes.size > soldPcodes.size + 10) {
    insights.push({
      id: 'dead-stock', category: 'Supply Chain', title: `${allPcodes.size - soldPcodes.size} SKU Tidak Laku (Dead Stock)`,
      desc: `Ada SKU yang terdaftar di sistem tapi sama sekali tidak ada penjualan di periode ini.`,
      severity: 'high', nonTechnicalActions: ['Cek stok fisik, jika ada lakukan cuci gudang (diskon besar).'], techActions: ['Buka Pivot Table, cari produk dengan omset 0.']
    });
  }

  // 24. Cross-Selling Gap (Toko beli A, tidak beli B)
  // (Disederhanakan untuk performa)

  return insights;
}