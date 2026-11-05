/* ═══════════════════════════════════════════════════════════════
   M245 Ask — AI Business Chatbot Assistant
   Menjawab pertanyaan user dalam bahasa natural menggunakan
   data real-time dari store (bukan API, bukan server).
   ═══════════════════════════════════════════════════════════════ */

import { esc, compactRp, NF1, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { generateAIReport } from '../analytics/engine.js';
import { overallComparison } from '../plugins/comparison.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';

// ═══ CHAT STATE ═══
let messages = [];
let isTyping = false;

// ═══════════════════════════════════════════════════════════════
// INTENT RECOGNITION — Deteksi maksud user dari teks natural
// ═══════════════════════════════════════════════════════════════
function detectIntent(text) {
  const q = text.toLowerCase().trim();

  // Greeting
  if (/^(halo|hai|hi|hello|pagi|siang|sore|malam|assalam|salam)/.test(q)) return 'greeting';
  // Help
  if (/^(help|bantuan|bisa apa|fitur|panduan|command|menu)/.test(q)) return 'help';

  // Revenue metrics
  if (/(omset|penjualan|revenue|sales).*(bulan|periode|sekarang|ini)|berapa omset|total omset|omset berapa/.test(q)) return 'omset';
  if (/(top|terbaik|tertinggi|juara|ranking|rank).*(salesman|sales|orang|tim)|salesman terbaik|siapa juara/.test(q)) return 'top_salesman';
  if (/(top|terlaris|terbaik|paling laku|paling banyak).*(produk|sku|barang)|produk terlaris|sku terlaris/.test(q)) return 'top_product';
  if (/(top|terbesar|terbaik|paling banyak).*(outlet|toko)|outlet terbaik|outlet terbesar/.test(q)) return 'top_outlet';
  if (/(top|terbesar|terbaik|paling banyak).*(divisi|kategori)|divisi terbesar/.test(q)) return 'top_divisi';
  if (/(top|terbesar|terbaik|wilayah|region|kabupaten|kota).*(wilayah|region|kabupaten|kota)|region terbaik/.test(q)) return 'top_region';

  // Churn / Drop
  if (/(churn|hilang|risk|berisiko|at.?risk|kunjungi|visit|drop.?off|tidak beli|berhenti)/.test(q)) return 'churn';

  // Target
  if (/(target|capaian|pencapaian|achiev|kurang|sisa)/.test(q)) return 'target';

  // Comparison
  if (/(banding|vs|versus|bulan lalu|lm|tahun lalu|ly|perbandingan|kemarin)/.test(q)) return 'comparison';

  // Quality
  if (/(return|retur|rusak|expired|kembali|kualitas)/.test(q)) return 'return';

  // Productivity
  if (/(ec|efektif|efektif call|kunjungan|visit)/.test(q)) return 'ec';
  if (/(ipt|basket|item|faktur|invoice)/.test(q)) return 'ipt';
  if (/(coverage|outlet aktif|oa|master|cakupan)/.test(q)) return 'coverage';

  // AI & Health
  if (/(rekomendasi|saran|action|tindakan|playbook|analisis|insight|solusi|masalah|issue)/.test(q)) return 'recommendation';
  if (/(health|sehat|kondisi|status|score|skor|bagaimana bisnis)/.test(q)) return 'health';

  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE GENERATOR — Membuat jawaban dari data real-time
// ═══════════════════════════════════════════════════════════════
function generateResponse(intent, state) {
  const rows = selectFiltered(state);
  const agg = selectAgg(state);
  const cmp = overallComparison(state);

  // Jika belum ada data sama sekali
  if (rows.length === 0 && intent !== 'greeting' && intent !== 'help') {
    return {
      content: '📭 Belum ada data yang bisa saya analisis.\n\nSilakan upload file LBP terlebih dahulu di menu **Data**.'
    };
  }

  const topSales = groupBy(rows, r => r.salesman, 'omset').sort((a, b) => b.value - a.value).slice(0, 3);
  const topProducts = groupBy(rows, r => r.product, 'omset').sort((a, b) => b.value - a.value).slice(0, 3);
  const topOutlets = groupBy(rows, r => r.outlet, 'omset').sort((a, b) => b.value - a.value).slice(0, 3);
  const topDivisi = groupBy(rows, r => r.divisi, 'omset').filter(g => g.label !== '—').sort((a, b) => b.value - a.value).slice(0, 3);
  const topRegion = groupBy(rows, r => r.kabupaten, 'omset').filter(g => g.label !== '—').sort((a, b) => b.value - a.value).slice(0, 3);

  switch (intent) {
    case 'greeting':
      return {
        content: `Halo! 👋 Saya **M245 AI Assistant**, siap membantu Anda menganalisis data penjualan.\n\nAnda bisa bertanya tentang:\n• 💰 **Omset** — total penjualan\n• 🏆 **Top salesman** — siapa juara\n• 📦 **Produk** — SKU terlaris\n• 🏪 **Outlet** — performa toko\n• ⚠️ **Churn** — outlet berisiko\n• 🎯 **Target** — pencapaian\n• 📊 **Banding** — vs bulan lalu\n\nCukup ketik pertanyaan Anda, atau klik chip cepat di bawah! 🚀`
      };

    case 'help':
      return {
        content: `📖 **Panduan Ask M245**\n\n**Contoh pertanyaan:**\n• "Berapa omset bulan ini?"\n• "Siapa salesman terbaik?"\n• "Produk apa yang paling laku?"\n• "Outlet mana yang berisiko churn?"\n• "Bagaimana capaian target?"\n• "Berapa return rate?"\n• "Berapa efektif call?"\n• "Bandingkan dengan bulan lalu"\n• "Apa rekomendasi AI?"\n• "Bagaimana kondisi bisnis?"\n\n**Tips:** Gunakan bahasa natural, saya akan memahami maksud Anda! 🧠`
      };

    case 'omset': {
      const delta = cmp?.deltaLM;
      const deltaStr = delta == null ? '' : delta > 0
        ? `📈 **Naik ${NF1.format(delta)}%** vs bulan lalu`
        : `📉 **Turun ${NF1.format(Math.abs(delta))}%** vs bulan lalu`;
      return {
        content: `💰 **Total Omset Periode Ini**\n\n**${compactRp(agg.omset)}**\n\n${deltaStr}\n\n📊 Rincian:\n• Gross Bruto: ${compactRp(agg.grossF)}\n• Return: ${compactRp(agg.grossR)} (${pct(agg.retRate)})\n• Total Faktur: ${NF1.format(agg.invoices)}\n• Outlet Aktif: ${agg.oa}`
      };
    }

    case 'top_salesman': {
      if (topSales.length === 0) return { content: 'Belum ada data salesman.' };
      const total = groupBy(rows, r => r.salesman, 'omset').length;
      return {
        content: `🏆 **Top ${topSales.length} Salesman**\n\n` +
          topSales.map((s, i) => {
            const medal = ['🥇', '🥈', '🥉'][i];
            return `${medal} **${esc(s.label)}**\n   ${compactRp(s.value)} · ${s.rows.length} baris`;
          }).join('\n\n') +
          `\n\n💡 _Total ${total} salesman aktif._`
      };
    }

    case 'top_product': {
      if (topProducts.length === 0) return { content: 'Belum ada data produk.' };
      const total = groupBy(rows, r => r.product, 'omset').length;
      return {
        content: `📦 **Top ${topProducts.length} Produk Terlaris**\n\n` +
          topProducts.map((p, i) => `${i + 1}. **${esc(p.label)}**\n   ${compactRp(p.value)}`).join('\n\n') +
          `\n\n💡 _SKU aktif: ${total} produk._`
      };
    }

    case 'top_outlet': {
      if (topOutlets.length === 0) return { content: 'Belum ada data outlet.' };
      return {
        content: `🏪 **Top ${topOutlets.length} Outlet B2B**\n\n` +
          topOutlets.map((o, i) => `${i + 1}. **${esc(o.label)}**\n   ${compactRp(o.value)}`).join('\n\n') +
          `\n\n💡 _Total outlet aktif: ${agg.oa} outlet._`
      };
    }

    case 'top_divisi': {
      if (topDivisi.length === 0) return { content: 'Belum ada data divisi.' };
      return {
        content: `📂 **Top Divisi**\n\n` +
          topDivisi.map((d, i) => `${i + 1}. **${esc(d.label)}** — ${compactRp(d.value)}`).join('\n')
      };
    }

    case 'top_region': {
      if (topRegion.length === 0) return { content: 'Belum ada data wilayah.' };
      return {
        content: `📍 **Top Wilayah (Kabupaten)**\n\n` +
          topRegion.map((r, i) => `${i + 1}. **${esc(r.label)}** — ${compactRp(r.value)}`).join('\n')
      };
    }

    case 'churn': {
      const outletMap = new Map();
      const months = Array.from(new Set(rows.map(r => r.day.slice(0, 7)))).sort();
      if (months.length < 2) {
        return { content: `⚠️ Butuh data minimal **2 bulan** untuk mendeteksi churn.\n\nFilter Anda saat ini hanya mencakup ${months.length} bulan.` };
      }

      const curr = months[months.length - 1];
      const prev = months[months.length - 2];
      for (const r of rows) {
        if (r.tt !== 'F') continue;
        if (!outletMap.has(r.outletKey)) outletMap.set(r.outletKey, { name: r.outlet, curr: 0, prev: 0 });
        const o = outletMap.get(r.outletKey);
        if (r.day.startsWith(curr)) o.curr += r.amount;
        else if (r.day.startsWith(prev)) o.prev += r.amount;
      }
      const atRisk = Array.from(outletMap.values())
        .filter(o => o.prev > 0 && (o.curr === 0 || o.curr / o.prev < 0.5))
        .sort((a, b) => (b.prev - b.curr) - (a.prev - a.curr))
        .slice(0, 5);

      if (atRisk.length === 0) {
        return { content: '✅ **Kabar baik!** Tidak ada outlet yang berisiko churn bulan ini. Retensi pelanggan Anda sehat.' };
      }

      return {
        content: `⚠️ **Outlet Berisiko Churn** (penurunan >50%)\n\n` +
          atRisk.map((o, i) => `${i + 1}. **${esc(o.name)}**\n   Bulan lalu: ${compactRp(o.prev)} → Bulan ini: ${compactRp(o.curr)}`).join('\n\n') +
          `\n\n💡 **Saran:** Kunjungi outlet ini segera atau tawarkan program win-back. Buka menu **Churn Radar** untuk daftar lengkap + tombol WhatsApp.`
      };
    }

    case 'target': {
      const activeMonth = state.targetMonth;
      const t = state.targets[activeMonth] || {};
      const globalTarget = t.global?.all || t.omset || 0;
      if (globalTarget === 0) {
        return { content: `🎯 Belum ada target yang di-set untuk periode **${activeMonth || 'saat ini'}**.\n\nBuka menu **Target** untuk mengatur target Omset, OA, EC, dan IPT.` };
      }
      const pctVal = (agg.omset / globalTarget) * 100;
      const gap = agg.omset - globalTarget;
      return {
        content: `🎯 **Pencapaian Target**\n\n**Target:** ${compactRp(globalTarget)}\n**Actual:** ${compactRp(agg.omset)}\n**Capaian:** ${pct(pctVal)} ${pctVal >= 100 ? '✅' : '⚠️'}\n**Gap:** ${gap >= 0 ? '+' : ''}${compactRp(gap)}\n\n${pctVal >= 100 ? '🎉 **Selamat!** Target sudah tercapai.' : pctVal >= 75 ? '📊 **Hampir!** Butuh dorongan ekstra untuk mencapai target.' : '🚨 **Waspada.** Perlu strategi agresif untuk mengejar target.'}`
      };
    }

    case 'comparison': {
      if (!cmp || cmp.currentOmset === 0) return { content: 'Belum ada data untuk perbandingan.' };
      const lm = cmp.lastMonth;
      const delta = cmp.deltaLM;
      return {
        content: `📊 **Perbandingan Periode**\n\n**Saat ini:** ${compactRp(cmp.currentOmset)}\n**Bulan lalu:** ${lm ? compactRp(lm) : 'n/a'}\n**Selisih:** ${delta != null ? (delta > 0 ? '📈 +' : '📉 ') + NF1.format(delta) + '%' : 'n/a'}\n\n**Avg 5 Week:** ${cmp.avg5w ? compactRp(cmp.avg5w) : '—'}\n**Avg 13 Week:** ${cmp.avg13w ? compactRp(cmp.avg13w) : '—'}`
      };
    }

    case 'return': {
      return {
        content: `📦 **Return Analysis**\n\n**Return Rate:** ${pct(agg.retRate)} ${agg.retRate > 2 ? '⚠️ (di atas batas normal)' : '✅ (sehat)'}\n**Nilai Return:** ${compactRp(agg.grossR)}\n**Gross Bruto:** ${compactRp(agg.grossF)}\n\n${agg.retRate > 2 ? '🚨 **Perhatian:** Return rate di atas 2% bisa jadi tanda masalah kualitas produk, expired, atau handling gudang. Cek menu Produk untuk SKU penyumbang retur terbesar.' : '💚 Return rate Anda sehat di bawah 2%. Pertahankan kualitas!'}`
      };
    }

    case 'ec': {
      return {
        content: `📞 **Efektif Call (EC)**\n\n**Nilai EC:** ${NF1.format(agg.efektifCall || 0)} toko/HK\n**Hari Kerja:** ${agg.hkDays || 0} hari\n**Outlet Aktif:** ${agg.oa}\n\n${(agg.efektifCall || 0) >= 20 ? '💪 **Excellent!** Produktivitas kunjungan salesman tinggi.' : (agg.efektifCall || 0) >= 12 ? '📊 **Cukup baik.** Masih bisa dioptimalkan.' : '⚠️ **Rendah.** Review routing salesman atau tambah kunjungan per hari.'}`
      };
    }

    case 'ipt': {
      return {
        content: `🛒 **Item per Transaksi (IPT)**\n\n**Nilai IPT:** ${NF1.format(agg.avgIpt || 0)} item/faktur\n**Total Faktur:** ${NF1.format(agg.invoices)}\n**Total Baris:** ${NF1.format(agg.lines)}\n\n${(agg.avgIpt || 0) >= 4 ? '✅ **IPT Sehat!** Salesman berhasil cross-selling dengan baik.' : '⚠️ **IPT Rendah.** Salesman cenderung hanya jual 1-2 SKU. Dorong cross-selling via bundling atau training.'}`
      };
    }

    case 'coverage': {
      const master = agg.masterCount || 0;
      const cov = master > 0 ? (agg.oa / master) * 100 : 0;
      return {
        content: `🏪 **Outlet Coverage**\n\n**Outlet Aktif:** ${agg.oa}\n**Master DMP:** ${master}\n**Coverage:** ${pct(cov)}\n\n${cov >= 80 ? '✅ **Coverage sangat baik!** Fokus ke produktivitas & retensi outlet.' : cov >= 50 ? '📊 **Coverage sedang.** Masih ada ruang untuk akuisisi outlet baru.' : '⚠️ **Coverage rendah.** Prioritaskan aktivasi outlet pasif di wilayah-wilayah kunci.'}`
      };
    }

    case 'health': {
      const ai = generateAIReport(state);
      return {
        content: `💚 **Kesehatan Bisnis**\n\n**Health Score:** ${ai.healthScore}/100 ${ai.healthScore >= 80 ? '✅' : (ai.healthScore >= 50 ? '⚠️' : '🚨')}\n\n${ai.summary.replace(/\*\*(.*?)\*\*/g, '**$1**').replace(/\n\n/g, '\n\n')}`
      };
    }

    case 'recommendation': {
      const ai = generateAIReport(state);
      if (ai.insights.length === 0) return { content: '🧠 Tidak ada rekomendasi khusus. Bisnis berjalan optimal.' };
      return {
        content: `🧠 **Rekomendasi AI Expert**\n\n` +
          ai.insights.slice(0, 3).map((f, i) =>
            `**${i + 1}. ${esc(f.title)}**\n   ${esc((f.nonTechnicalActions && f.nonTechnicalActions[0]) || f.recommendation || '')}`
          ).join('\n\n') +
          `\n\n💡 Buka menu **AI Insight** untuk playbook lengkap (teknis & non-teknis).`
      };
    }

    default:
      return {
        content: `Maaf, saya belum memahami pertanyaan Anda. 🤔\n\nCoba tanya dengan kata kunci:\n• "Omset"\n• "Top salesman"\n• "Produk terlaris"\n• "Outlet churn"\n• "Capaian target"\n• "Rekomendasi AI"\n\nAtau ketik **"help"** untuk panduan lengkap.`
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// RENDER MESSAGES — Tampilkan bubble chat
// ═══════════════════════════════════════════════════════════════
function renderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  container.innerHTML = messages.map(m => {
    if (m.role === 'user') {
      return `
        <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
          <div style="background:#1D4ED8; color:#fff; padding:10px 14px; border-radius:16px 16px 4px 16px; max-width:80%; font-size:13px; line-height:1.5; box-shadow:0 2px 6px rgba(29,78,216,0.2);">
            ${esc(m.content)}
          </div>
        </div>`;
    } else {
      const html = m.content
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/_(.*?)_/g, '<i style="color:#64748B;">$1</i>')
        .replace(/\n/g, '<br>');
      return `
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#8B5CF6,#1D4ED8); display:flex; align-items:center; justify-content:center; color:#fff; font-size:16px; flex-shrink:0;">🤖</div>
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px 14px; border-radius:16px 16px 16px 4px; max-width:85%; font-size:13px; line-height:1.6; color:#334155;">
            ${html}
          </div>
        </div>`;
    }
  }).join('');

  if (isTyping) {
    container.innerHTML += `
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#8B5CF6,#1D4ED8); display:flex; align-items:center; justify-content:center; color:#fff; font-size:16px; flex-shrink:0;">🤖</div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:14px 18px; border-radius:16px;">
          <div style="display:flex; gap:4px;">
            <div style="width:8px; height:8px; border-radius:50%; background:#94A3B8; animation:bounce 1.4s infinite;"></div>
            <div style="width:8px; height:8px; border-radius:50%; background:#94A3B8; animation:bounce 1.4s infinite 0.2s;"></div>
            <div style="width:8px; height:8px; border-radius:50%; background:#94A3B8; animation:bounce 1.4s infinite 0.4s;"></div>
          </div>
        </div>
      </div>`;
  }

  container.scrollTop = container.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// SEND MESSAGE — Proses pesan user & trigger response
// ═══════════════════════════════════════════════════════════════
function sendMessage(text) {
  if (!text || !text.trim()) return;

  messages.push({ role: 'user', content: text });
  renderMessages();

  const input = document.getElementById('chat-input');
  if (input) input.value = '';

  isTyping = true;
  renderMessages();

  setTimeout(() => {
    try {
      const intent = detectIntent(text);
      const response = generateResponse(intent, store.state);
      messages.push({ role: 'assistant', content: response.content });
    } catch (e) {
      messages.push({ role: 'assistant', content: '⚠️ Maaf, terjadi error saat memproses. Coba lagi.' });
      console.error('[chatbot]', e);
    }
    isTyping = false;
    renderMessages();
  }, 800 + Math.random() * 600);
}

// ═══════════════════════════════════════════════════════════════
// SHELL — Struktur HTML
// ═══════════════════════════════════════════════════════════════
function shell() {
  return `
    <style>
      @keyframes bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }
      .chat-chip:active { transform: scale(0.95); transition: transform 0.1s; }
      #chat-messages::-webkit-scrollbar { width: 4px; }
      #chat-messages::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }
    </style>
    <div style="max-width:820px; margin:0 auto; display:flex; flex-direction:column; height:calc(100vh - 220px); min-height:500px;">

      <!-- HEADER -->
      <div style="background:linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%); color:#fff; padding:16px 20px; border-radius:12px 12px 0 0; display:flex; align-items:center; gap:12px; flex-shrink:0;">
        <div style="width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#8B5CF6,#3B82F6); display:flex; align-items:center; justify-content:center; font-size:22px;">🤖</div>
        <div>
          <div style="font-size:15px; font-weight:900;">Ask M245</div>
          <div style="font-size:10px; color:#A78BFA;">AI Business Assistant · Online</div>
        </div>
      </div>

      <!-- CHAT AREA -->
      <div id="chat-messages" style="flex:1; overflow-y:auto; padding:16px; background:#fff; border:1px solid #E2E8F0; border-top:none;"></div>

      <!-- QUICK CHIPS -->
      <div id="quick-chips" style="padding:10px 16px; background:#fff; border:1px solid #E2E8F0; border-top:none; display:flex; gap:6px; overflow-x:auto; flex-shrink:0;">
        <button class="chat-chip" data-q="Berapa omset bulan ini?" style="white-space:nowrap; padding:8px 12px; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">💰 Omset</button>
        <button class="chat-chip" data-q="Siapa salesman terbaik?" style="white-space:nowrap; padding:8px 12px; background:#F0FDF4; color:#166534; border:1px solid #BBF7D0; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">🏆 Top Sales</button>
        <button class="chat-chip" data-q="Produk apa yang terlaris?" style="white-space:nowrap; padding:8px 12px; background:#FFF7ED; color:#9A3412; border:1px solid #FED7AA; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">📦 Produk</button>
        <button class="chat-chip" data-q="Outlet mana yang berisiko churn?" style="white-space:nowrap; padding:8px 12px; background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">⚠️ Churn</button>
        <button class="chat-chip" data-q="Bagaimana capaian target?" style="white-space:nowrap; padding:8px 12px; background:#F5F3FF; color:#5B21B6; border:1px solid #DDD6FE; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">🎯 Target</button>
        <button class="chat-chip" data-q="Apa rekomendasi AI?" style="white-space:nowrap; padding:8px 12px; background:#F8FAFC; color:#0F172A; border:1px solid #E2E8F0; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">🧠 AI Saran</button>
        <button class="chat-chip" data-q="Bandingkan dengan bulan lalu" style="white-space:nowrap; padding:8px 12px; background:#F8FAFC; color:#0F172A; border:1px solid #E2E8F0; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">📊 Banding</button>
        <button class="chat-chip" data-q="Bagaimana kondisi bisnis?" style="white-space:nowrap; padding:8px 12px; background:#F8FAFC; color:#0F172A; border:1px solid #E2E8F0; border-radius:20px; font-size:11px; font-weight:700; cursor:pointer;">💚 Health</button>
      </div>

      <!-- INPUT -->
      <div style="padding:12px 16px; background:#F8FAFC; border:1px solid #E2E8F0; border-top:none; border-radius:0 0 12px 12px; display:flex; gap:8px; flex-shrink:0;">
        <input id="chat-input" type="text" placeholder="Tanya apa saja..." autocomplete="off" style="flex:1; padding:12px 16px; border:1px solid #E2E8F0; border-radius:24px; font-size:13px; outline:none; background:#fff;">
        <button id="chat-send" style="padding:12px 20px; background:#1D4ED8; color:#fff; border:none; border-radius:24px; font-weight:800; font-size:13px; cursor:pointer; box-shadow:0 4px 12px rgba(29,78,216,0.3);">Kirim</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — Render konten
// ═══════════════════════════════════════════════════════════════
function update(container, state) {
  if (messages.length === 0) {
    messages.push({
      role: 'assistant',
      content: `Halo! 👋 Saya **M245 AI Assistant**.\n\nSilakan tanya apa saja tentang data penjualan Anda:\n• 💰 "Berapa omset bulan ini?"\n• 🏆 "Siapa salesman terbaik?"\n• ⚠️ "Outlet mana yang perlu dikunjungi?"\n\nAtau klik chip cepat di bawah! 🚀`
    });
  }
  renderMessages();
}

// ═══════════════════════════════════════════════════════════════
// REGISTER VIEW
// ═══════════════════════════════════════════════════════════════
registerView('chatbot', {
  label: 'Ask M245',
  title: 'Ask M245',
  sub: 'AI Business Assistant',
  shell,
  update,
  mount() {
    // Handler Enter key
    document.addEventListener('keydown', (e) => {
      if (e.target.id === 'chat-input' && e.key === 'Enter') {
        e.preventDefault();
        sendMessage(e.target.value);
      }
    });

    // Handler klik
    document.addEventListener('click', (e) => {
      if (e.target.id === 'chat-send') {
        const input = document.getElementById('chat-input');
        if (input) sendMessage(input.value);
        return;
      }
      const chip = e.target.closest('.chat-chip');
      if (chip) {
        sendMessage(chip.dataset.q);
      }
    });
  }
});