const VIEWS = new Map();
export function registerView(id, config){ VIEWS.set(id, config); }
export function getView(id){ return VIEWS.get(id); }
export function listViews(){ return Array.from(VIEWS.entries()).map(([id, cfg]) => ({ id, label: cfg.label })); }