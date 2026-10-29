import { esc, rp, compactRp } from '../core/utils.js';
import { patchText, patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { sortableTable } from '../ui/table.js';
import { registerView } from './registry.js';


registerView('topoutlet', {
  label: 'Top Outlet',
  title: 'Top 100 Outlet',
  sub: 'Outlet dengan omset terbesar',
  shell(){
    return `
      <div class="grid kpis">
        <div class="kpi"><div class="kpi-l">Omset</div><div class="kpi-v" id="to-kpi"></div></div>
      </div>
      <div class="card" id="to-table"></div>
    `;
  },
  update(container, state){
    const rows = selectFiltered(state);
    const agg = selectAgg(state);
    patchText('#to-kpi', compactRp(agg.omset));

    const list = groupBy(rows, r => r.outlet, 'omset')
      .sort((a, b) => b.value - a.value)
      .slice(0, 100);

    patchHTML('#to-table', sortableTable({
      scope: 'topoutlet',
      rows: list,
      columns: [
        { key: 'label', label: 'Outlet', render: r => esc(r.label) },
        { key: 'value', label: 'Omset', align: 'num', render: r => rp(r.value) },
      ],
    }));
  },
});