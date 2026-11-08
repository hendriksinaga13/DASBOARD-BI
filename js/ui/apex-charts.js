// ui/apex-charts.js

const chartInstances = {};

export function renderChart(selector, options) {
  const el = document.querySelector(selector);
  if (!el) return;

  // Hancurkan chart lama sebelum render yang baru
  if (chartInstances[selector]) {
    chartInstances[selector].destroy();
  }
  
  const chart = new ApexCharts(el, options);
  chart.render();
  chartInstances[selector] = chart;

  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 300);
}

// ✅ 1. SCATTER CHART
export function scatterChart(selector, dataPoints, xName, yName) {
  const options = {
    series: [{
      name: 'Salesman',
      data: dataPoints.map(d => ({ x: d.x, y: d.y, name: d.label }))
    }],
    chart: {
      type: 'scatter',
      height: 320,
      width: '100%',
      redrawOnParentResize: true,
      zoom: { enabled: true, type: 'xy' },
      toolbar: { show: false },
      fontFamily: 'inherit'
    },
    xaxis: { title: { text: xName, style: { fontSize: '12px', fontWeight: 600 } }, tickAmount: 5 },
    yaxis: { 
      title: { text: yName, style: { fontSize: '12px', fontWeight: 600 } },
      labels: { formatter: (val) => val >= 1000000 ? (val / 1000000).toFixed(1) + ' Jt' : val }
    },
    tooltip: {
      custom: function({series, seriesIndex, dataPointIndex, w}) {
        const point = w.globals.initialSeries[seriesIndex].data[dataPointIndex];
        return `<div style="padding: 8px; font-size: 12px;">
                <b style="color: #1D4ED8;">${point.name}</b><br>
                ${xName}: <b>${point.x.toFixed(1)}</b><br>
                ${yName}: <b>Rp ${point.y.toLocaleString('id-ID')}</b>
                </div>`;
      }
    },
    colors: ['#1D4ED8'],
    markers: { size: 6, strokeWidth: 2, strokeColors: '#fff' }
  };
  renderChart(selector, options);
}

// ✅ 2. BAR CHART (Horizontal)
export function barChart(selector, dataPoints, title) {
  const sorted = [...dataPoints].sort((a, b) => b.y - a.y).slice(0, 7); // Ambil Top 7
  
  const options = {
    series: [{ name: title, data: sorted.map(d => d.y) }],
    chart: {
      type: 'bar',
      height: 320,
      width: '100%',
      toolbar: { show: false },
      fontFamily: 'inherit'
    },
    plotOptions: {
      bar: { horizontal: true, borderRadius: 4, barHeight: '60%' }
    },
    xaxis: {
      categories: sorted.map(d => d.label),
      labels: { formatter: (val) => val >= 1000000 ? (val / 1000000).toFixed(1) + ' Jt' : val }
    },
    colors: ['#1D4ED8'],
    dataLabels: { 
      enabled: true, 
      formatter: (val) => val >= 1000000 ? (val / 1000000).toFixed(1) + ' Jt' : val,
      style: { fontSize: '10px', colors: ['#fff'] }
    }
  };
  renderChart(selector, options);
}

// ✅ 3. RADAR CHART (Multi-Salesman Comparison)
export function radarMultiChart(selector, dataPoints) {
  // Ambil 3 Salesman dengan Omset tertinggi
  const top3 = [...dataPoints].sort((a, b) => b.y - a.y).slice(0, 3);
  
  // Normalisasi data (0-100) agar masuk ke Radar
  const maxOmset = top3[0].y;
  const maxEc = Math.max(...dataPoints.map(d => d.x));

  const series = top3.map(d => ({
    name: d.label,
    data: [
      (d.y / maxOmset) * 100, // Normalisasi Omset
      (d.x / maxEc) * 100     // Normalisasi EC
    ]
  }));

  const options = {
    series: series,
    chart: {
      type: 'radar',
      height: 320,
      width: '100%',
      toolbar: { show: false },
      fontFamily: 'inherit'
    },
    labels: ['Omset (Score)', 'Efektif Call (Score)'],
    stroke: { width: 2, curve: 'smooth' },
    fill: { opacity: 0.15 },
    markers: { size: 4 },
    colors: ['#1D4ED8', '#F59E0B', '#10B981'],
    legend: { position: 'bottom', fontSize: '11px' }
  };
  renderChart(selector, options);
}