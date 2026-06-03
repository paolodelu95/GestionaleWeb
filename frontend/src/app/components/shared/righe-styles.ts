/**
 * Stili condivisi della tabella "righe" dei documenti (fatture, preventivi, ordini,
 * DDT, note di credito, acquisti, ricorrenti).
 *
 * Prima erano duplicati in 7 componenti e avevano iniziato a divergere
 * (es. .prezzo-cell solo in Fatture, .colli-row solo in DDT): un'unica fonte
 * garantisce che la griglia righe resti identica in tutti i documenti.
 * Le classi specifiche di un documento sono incluse qui ma applicate solo dove usate.
 */
export const RIGHE_STYLES = `
  .righe-section { margin-top: 16px; }
  .righe-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .righe-table { width: 100%; border-collapse: collapse; }
  .righe-table th { background: #f8fafc; padding: 8px; font-size: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .righe-table td { padding: 4px 2px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .riga-input { border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; font-size: 13px; width: 100%; box-sizing: border-box; }
  .riga-input.num { width: 72px; }
  .riga-input.sconto { width: 60px; }
  .righe-total { text-align: right; padding: 10px 16px; font-weight: 700; background: #f8fafc; border-top: 2px solid #e2e8f0; }
  .td-search { width: 36px; padding: 0 !important; }
  .td-history { width: 28px; padding: 0 !important; }
  .td-desc { min-width: 160px; }
  .td-drag { width: 28px; padding: 0 !important; cursor: grab; color: #94a3b8; }
  .riga-codice { font-size:11px; color:#64748b; border-bottom:none !important; border-radius:4px 4px 0 0 !important; background:#f8fafc; margin-bottom:0; }
  .riga-nota td { background: #fefce8; }
  .riga-nota input { font-style: italic; color: #78716c; }
  .prezzo-cell { display: flex; align-items: center; gap: 2px; }
  .prezzo-recente-item { display:flex; justify-content:space-between; gap:16px; font-size:13px; min-width:220px; }
  .pr-meta { color:#64748b; font-size:11px; }
  .righe-error { display: flex; align-items: center; gap: 4px; color: #dc2626; font-size: 12px; font-weight: 500; }
  .righe-error mat-icon { font-size: 15px; width: 15px; height: 15px; }
  .input-error { border-color:#dc2626 !important; }
  .colli-row { display:flex; align-items:flex-end; gap:8px; }
  .colli-calc-btn { margin-bottom:20px; flex-shrink:0; }
  .cdk-drag-placeholder { opacity: 0.4; }
  .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
`;
