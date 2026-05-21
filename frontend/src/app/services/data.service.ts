import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  Azienda, NotificheConfig, Prodotto, ProdottoVariante, Cliente, ClienteIndirizzo, Fornitore,
  Ddt, Fattura, NotaCredito, Ordine, Preventivo,
  Pagamento, ScadenzarioEntry, TipoPagamento, Acquisto,
  CategoriaProdotto, UnitaMisura, AliquotaIva, Listino, ListinoPrezzo, PrezzoRisolto,
  MovimentoMagazzino, GiacenzaStorica, VenditaBanco,
  ArrivoMerce, Utente, StatsVenditeMensili, StatsAcquistiMensili,
  StatsTopProdotto, StatsTopCliente, StatsCashflow, StatsKpiAnno, Sollecito,
  NotaRapida
} from '../models';

@Injectable({ providedIn: 'root' })
export class DataService {
  constructor(private api: ApiService) {}

  // Azienda
  getAzienda(): Observable<Azienda> { return this.api.get('azienda'); }
  updateAzienda(a: Azienda): Observable<any> { return this.api.put('azienda', a); }
  saveAzienda(a: Azienda): Observable<any> { return this.api.put('azienda', a); }

  // Prodotti
  getProdotti(): Observable<Prodotto[]> { return this.api.get('prodotti'); }
  getProdottiSottoSoglia(): Observable<Prodotto[]> { return this.api.get('prodotti/sotto-soglia'); }
  getProdottiCount(): Observable<number> { return this.api.get('prodotti/count'); }
  getProdottiValore(): Observable<number> { return this.api.get('prodotti/valore'); }
  createProdotto(p: Prodotto): Observable<any> { return this.api.post('prodotti', p); }
  updateProdotto(p: Prodotto): Observable<any> { return this.api.put(`prodotti/${p.id}`, p); }
  deleteProdotto(id: number): Observable<any> { return this.api.delete(`prodotti/${id}`); }

  importProdotti(records: any[]): Observable<any> { return this.api.post('prodotti/import', records); }

  // Varianti prodotto
  getProdottoVarianti(prodottoId: number): Observable<ProdottoVariante[]> { return this.api.get(`prodotto-varianti/${prodottoId}`); }
  searchByBarcode(barcode: string): Observable<{ prodotto: Prodotto; variante: ProdottoVariante | null }> {
    return this.api.get(`prodotto-varianti/barcode/${encodeURIComponent(barcode)}`);
  }

  // Clienti
  getClienti(): Observable<Cliente[]> { return this.api.get('clienti'); }
  getClientiCount(): Observable<number> { return this.api.get('clienti/count'); }
  createCliente(c: Cliente): Observable<any> { return this.api.post('clienti', c); }
  updateCliente(c: Cliente): Observable<any> { return this.api.put(`clienti/${c.id}`, c); }
  deleteCliente(id: number): Observable<any> { return this.api.delete(`clienti/${id}`); }
  importClienti(records: any[]): Observable<any> { return this.api.post('clienti/import', records); }
  getClienteIndirizzi(clienteId: number): Observable<ClienteIndirizzo[]> { return this.api.get(`clienti/${clienteId}/indirizzi`); }
  getFattureInsoluteCliente(clienteId: number): Observable<{ id: number; numero: string; dataEmissione: string; totale: number; stato: string }[]> {
    return this.api.get(`clienti/${clienteId}/fatture-insolute`);
  }
  createClienteIndirizzo(clienteId: number, a: ClienteIndirizzo): Observable<any> { return this.api.post(`clienti/${clienteId}/indirizzi`, a); }
  updateClienteIndirizzo(clienteId: number, a: ClienteIndirizzo): Observable<any> { return this.api.put(`clienti/${clienteId}/indirizzi/${a.id}`, a); }
  deleteClienteIndirizzo(clienteId: number, id: number): Observable<any> { return this.api.delete(`clienti/${clienteId}/indirizzi/${id}`); }

  // Fornitori
  getFornitori(): Observable<Fornitore[]> { return this.api.get('fornitori'); }
  createFornitore(f: Fornitore): Observable<any> { return this.api.post('fornitori', f); }
  updateFornitore(f: Fornitore): Observable<any> { return this.api.put(`fornitori/${f.id}`, f); }
  deleteFornitore(id: number): Observable<any> { return this.api.delete(`fornitori/${id}`); }
  importFornitori(records: any[]): Observable<any> { return this.api.post('fornitori/import', records); }

  // DDT
  getDdt(): Observable<Ddt[]> { return this.api.get('ddt'); }
  getDdtById(id: number): Observable<Ddt> { return this.api.get(`ddt/${id}`); }
  getDdtNonFatturati(): Observable<Ddt[]> { return this.api.get('ddt/non-fatturati'); }
  createDdt(d: Ddt): Observable<any> { return this.api.post('ddt', d); }
  updateDdt(d: Ddt): Observable<any> { return this.api.put(`ddt/${d.id}`, d); }
  deleteDdt(id: number): Observable<any> { return this.api.delete(`ddt/${id}`); }

  // Fatture
  getFatture(): Observable<Fattura[]> { return this.api.get('fatture'); }
  getFatturaById(id: number): Observable<Fattura> { return this.api.get(`fatture/${id}`); }
  createFattura(f: Fattura): Observable<any> { return this.api.post('fatture', f); }
  updateFattura(f: Fattura): Observable<any> { return this.api.put(`fatture/${f.id}`, f); }
  deleteFattura(id: number): Observable<any> { return this.api.delete(`fatture/${id}`); }
  generaFattureDaDdt(items: { clienteId: number | null; ddtIds: number[]; tipoPagamentoId: number | null }[]): Observable<{ fatture: { id: number; numero: string; clienteNome: string; ddtNums: string }[] }> {
    return this.api.post('fatture/da-ddt', { items });
  }

  // Note di Credito
  getNoteCredito(): Observable<NotaCredito[]> { return this.api.get('note-credito'); }
  getNotaCreditoById(id: number): Observable<NotaCredito> { return this.api.get(`note-credito/${id}`); }
  createNotaCredito(n: NotaCredito): Observable<any> { return this.api.post('note-credito', n); }
  updateNotaCredito(n: NotaCredito): Observable<any> { return this.api.put(`note-credito/${n.id}`, n); }
  deleteNotaCredito(id: number): Observable<any> { return this.api.delete(`note-credito/${id}`); }

  // Ordini
  getOrdini(): Observable<Ordine[]> { return this.api.get('ordini'); }
  getOrdiniApertiCount(): Observable<number> { return this.api.get('ordini/count-aperti'); }
  getOrdineById(id: number): Observable<Ordine> { return this.api.get(`ordini/${id}`); }
  createOrdine(o: Ordine): Observable<any> { return this.api.post('ordini', o); }
  updateOrdine(o: Ordine): Observable<any> { return this.api.put(`ordini/${o.id}`, o); }
  deleteOrdine(id: number): Observable<any> { return this.api.delete(`ordini/${id}`); }

  // Preventivi
  getPreventivi(): Observable<Preventivo[]> { return this.api.get('preventivi'); }
  getPreventivoById(id: number): Observable<Preventivo> { return this.api.get(`preventivi/${id}`); }
  createPreventivo(p: Preventivo): Observable<any> { return this.api.post('preventivi', p); }
  updatePreventivo(p: Preventivo): Observable<any> { return this.api.put(`preventivi/${p.id}`, p); }
  deletePreventivo(id: number): Observable<any> { return this.api.delete(`preventivi/${id}`); }

  // Print
  getFatturaPrint(id: number): Observable<any> { return this.api.get(`fatture/${id}/print`); }
  getDdtPrint(id: number): Observable<any> { return this.api.get(`ddt/${id}/print`); }
  getNotaCreditoPrint(id: number): Observable<any> { return this.api.get(`note-credito/${id}/print`); }
  getOrdinePrint(id: number): Observable<any> { return this.api.get(`ordini/${id}/print`); }
  getPreventivoePrint(id: number): Observable<any> { return this.api.get(`preventivi/${id}/print`); }
  getAcquistoPrint(id: number): Observable<any> { return this.api.get(`acquisti/${id}/print`); }

  // Utility
  getNextNumero(tipo: string): Observable<{ numero: number }> { return this.api.get(`next-number/${tipo}`); }
  setDdtStato(id: number, stato: string): Observable<any> { return this.api.patch(`ddt/${id}/stato`, { stato }); }
  setFatturaStato(id: number, stato: string): Observable<any> { return this.api.patch(`fatture/${id}/stato`, { stato }); }
  setNotaCreditoStato(id: number, stato: string): Observable<any> { return this.api.patch(`note-credito/${id}/stato`, { stato }); }
  setOrdineStato(id: number, stato: string): Observable<any> { return this.api.patch(`ordini/${id}/stato`, { stato }); }
  setPreventivoStato(id: number, stato: string): Observable<any> { return this.api.patch(`preventivi/${id}/stato`, { stato }); }

  // Pagamenti
  getPagamenti(tipo?: string): Observable<Pagamento[]> {
    return this.api.get(tipo ? `pagamenti?tipo=${tipo}` : 'pagamenti');
  }
  getScadenzario(): Observable<ScadenzarioEntry[]> { return this.api.get('pagamenti/scadenzario'); }
  getScadenzarioFull(mese?: string): Observable<any[]> {
    const q = mese ? `?mese=${mese}` : '';
    return this.api.get(`scadenzario${q}`);
  }
  createPagamento(p: Pagamento): Observable<any> { return this.api.post('pagamenti', p); }
  updatePagamento(p: Pagamento): Observable<any> { return this.api.put(`pagamenti/${p.id}`, p); }
  deletePagamento(id: number): Observable<any> { return this.api.delete(`pagamenti/${id}`); }

  // Tipi Pagamento
  getTipiPagamento(): Observable<TipoPagamento[]> { return this.api.get('tipi-pagamento'); }
  createTipoPagamento(t: TipoPagamento): Observable<any> { return this.api.post('tipi-pagamento', t); }
  updateTipoPagamento(t: TipoPagamento): Observable<any> { return this.api.put(`tipi-pagamento/${t.id}`, t); }
  deleteTipoPagamento(id: number): Observable<any> { return this.api.delete(`tipi-pagamento/${id}`); }

  // Categorie Prodotto
  getCategorieProdotto(): Observable<CategoriaProdotto[]> { return this.api.get('categorie-prodotto'); }
  createCategoriaProdotto(c: CategoriaProdotto): Observable<any> { return this.api.post('categorie-prodotto', c); }
  updateCategoriaProdotto(c: CategoriaProdotto): Observable<any> { return this.api.put(`categorie-prodotto/${c.id}`, c); }
  deleteCategoriaProdotto(id: number): Observable<any> { return this.api.delete(`categorie-prodotto/${id}`); }

  // Listini personalizzati
  getListini(): Observable<Listino[]> { return this.api.get('listini'); }
  getListino(id: number): Observable<Listino> { return this.api.get(`listini/${id}`); }
  createListino(l: Listino): Observable<any> { return this.api.post('listini', l); }
  updateListino(l: Listino): Observable<any> { return this.api.put(`listini/${l.id}`, l); }
  deleteListino(id: number): Observable<any> { return this.api.delete(`listini/${id}`); }

  getListinoPrezzi(listinoId: number): Observable<ListinoPrezzo[]> {
    return this.api.get(`listini/${listinoId}/prezzi`);
  }
  upsertListinoPrezzo(listinoId: number, p: { prodottoId: number; prezzo?: number | null; sconto?: number | null }): Observable<any> {
    return this.api.post(`listini/${listinoId}/prezzi`, p);
  }
  deleteListinoPrezzo(listinoId: number, prezzoId: number): Observable<any> {
    return this.api.delete(`listini/${listinoId}/prezzi/${prezzoId}`);
  }
  resolvePrezzoCliente(clienteId: number, prodottoId: number): Observable<PrezzoRisolto> {
    return this.api.get(`listini/resolve/${clienteId}/${prodottoId}`);
  }

  // Unità di Misura
  getUnitaMisura(): Observable<UnitaMisura[]> { return this.api.get('unita-misura'); }
  createUnitaMisura(u: UnitaMisura): Observable<any> { return this.api.post('unita-misura', u); }
  updateUnitaMisura(u: UnitaMisura): Observable<any> { return this.api.put(`unita-misura/${u.id}`, u); }
  deleteUnitaMisura(id: number): Observable<any> { return this.api.delete(`unita-misura/${id}`); }

  // Aliquote IVA
  getAliquoteIva(): Observable<AliquotaIva[]> { return this.api.get('aliquote-iva'); }
  createAliquotaIva(a: AliquotaIva): Observable<any> { return this.api.post('aliquote-iva', a); }
  updateAliquotaIva(a: AliquotaIva): Observable<any> { return this.api.put(`aliquote-iva/${a.id}`, a); }
  deleteAliquotaIva(id: number): Observable<any> { return this.api.delete(`aliquote-iva/${id}`); }

  // Prezzi recenti per prodotto+cliente
  getPrezziRecenti(prodottoId: number, clienteId?: number | null): Observable<any[]> {
    const params = clienteId ? `prodottoId=${prodottoId}&clienteId=${clienteId}` : `prodottoId=${prodottoId}`;
    return this.api.get(`prezzi-recenti?${params}`);
  }

  // Acquisti
  getAcquisti(): Observable<Acquisto[]> { return this.api.get('acquisti'); }
  getAcquistoById(id: number): Observable<Acquisto> { return this.api.get(`acquisti/${id}`); }
  createAcquisto(a: Acquisto): Observable<any> { return this.api.post('acquisti', a); }
  updateAcquisto(a: Acquisto): Observable<any> { return this.api.put(`acquisti/${a.id}`, a); }
  deleteAcquisto(id: number): Observable<any> { return this.api.delete(`acquisti/${id}`); }
  setAcquistoStato(id: number, stato: string): Observable<any> { return this.api.patch(`acquisti/${id}/stato`, { stato }); }

  // Vendite al banco
  getVenditeBanco(): Observable<VenditaBanco[]> { return this.api.get('vendite-banco'); }
  getVenditaBancoPrint(id: number): Observable<any> { return this.api.get(`vendite-banco/${id}/print`); }
  createVenditaBanco(v: VenditaBanco): Observable<any> { return this.api.post('vendite-banco', v); }
  deleteVenditaBanco(id: number): Observable<any> { return this.api.delete(`vendite-banco/${id}`); }
  getNextNumberVenditaBanco(): Observable<{ numero: number }> { return this.api.get('next-number/vendite-banco'); }
  generaFatturaFromVendita(venditaId: number, clienteId: number): Observable<{ id: number; numero: string }> {
    return this.api.post(`vendite-banco/${venditaId}/genera-fattura`, { clienteId });
  }

  // Arrivi Merce
  getArriviMerce(): Observable<ArrivoMerce[]> { return this.api.get('arrivi-merce'); }
  getArrivoMerceById(id: number): Observable<ArrivoMerce> { return this.api.get(`arrivi-merce/${id}`); }
  createArrivoMerce(a: ArrivoMerce): Observable<any> { return this.api.post('arrivi-merce', a); }
  updateArrivoMerce(a: ArrivoMerce): Observable<any> { return this.api.put(`arrivi-merce/${a.id}`, a); }
  deleteArrivoMerce(id: number): Observable<any> { return this.api.delete(`arrivi-merce/${id}`); }
  setArrivoMerceStato(id: number, stato: string): Observable<any> { return this.api.patch(`arrivi-merce/${id}/stato`, { stato }); }
  importArrivoMerceFromAcquisto(acquistoId: number): Observable<Partial<ArrivoMerce>> {
    return this.api.post(`arrivi-merce/from-acquisto/${acquistoId}`, {});
  }

  // Magazzino
  getMovimentiMagazzino(filters: Record<string, any> = {}): Observable<MovimentoMagazzino[]> {
    const qs = Object.entries(filters)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return this.api.get(`movimenti-magazzino${qs ? '?' + qs : ''}`);
  }
  getMagazzinoStorico(data: string): Observable<GiacenzaStorica[]> {
    return this.api.get(`movimenti-magazzino/storico?data=${data}`);
  }

  // Stats / Dashboard
  getVenditeMensili(): Observable<StatsVenditeMensili[]> { return this.api.get('stats/vendite-mensili'); }
  getAcquistiMensili(): Observable<StatsAcquistiMensili[]> { return this.api.get('stats/acquisti-mensili'); }
  getTopProdotti(anno?: number): Observable<StatsTopProdotto[]> {
    return this.api.get(anno ? `stats/top-prodotti?anno=${anno}` : 'stats/top-prodotti');
  }
  getTopClienti(anno?: number): Observable<StatsTopCliente[]> {
    return this.api.get(anno ? `stats/top-clienti?anno=${anno}` : 'stats/top-clienti');
  }
  getCashflow(): Observable<StatsCashflow> { return this.api.get('stats/cashflow'); }
  getCashflowForecast(giorni = 60): Observable<{ giorni: number; saldoFinale: number; totEntrate: number; totUscite: number; items: { date: string; in: number; out: number; cumulativo: number }[] }> {
    return this.api.get(`stats/cashflow-forecast?giorni=${giorni}`);
  }
  getTopProdottiCliente(clienteId: number, limit = 5): Observable<{ id: number; nome: string; codice?: string; prezzo: number; iva: number; unitaMisura?: string; occorrenze: number; quantitaTotale: number; ultimaVendita: string }[]> {
    return this.api.get(`clienti/${clienteId}/top-prodotti?limit=${limit}`);
  }
  getKpiAnno(anno?: number): Observable<StatsKpiAnno> {
    return this.api.get(anno ? `stats/kpi-anno?anno=${anno}` : 'stats/kpi-anno');
  }

  getBiStats(anno?: number): Observable<any> {
    return this.api.get(anno ? `stats/bi?anno=${anno}` : 'stats/bi');
  }

  // Email
  testSmtp(): Observable<any> { return this.api.post('email/test', {}); }
  sendEmail(to: string, subject: string, html?: string): Observable<any> {
    return this.api.post('email/send', { to, subject, html });
  }
  sendFatturaEmail(id: number, to?: string, note?: string): Observable<any> {
    return this.api.post(`email/fattura/${id}`, { to, note });
  }
  sendAcquistoEmail(id: number, to?: string, note?: string): Observable<any> {
    return this.api.post(`email/acquisto/${id}`, { to, note });
  }
  sendSollecito(tipo: 'fattura' | 'acquisto', id: number, to?: string, note?: string): Observable<any> {
    return this.api.post(`email/sollecito/${tipo}/${id}`, { to, note });
  }
  getSolleciti(tipo: 'fattura' | 'acquisto', id: number): Observable<Sollecito[]> {
    return this.api.get(`email/solleciti/${tipo}/${id}`);
  }

  // Utenti
  getUtenti(): Observable<Utente[]> { return this.api.get('utenti'); }
  createUtente(u: Utente): Observable<any> { return this.api.post('utenti', u); }
  updateUtente(u: Utente): Observable<any> { return this.api.put(`utenti/${u.id}`, u); }
  deleteUtente(id: number): Observable<any> { return this.api.delete(`utenti/${id}`); }
  loginUtente(username: string, password: string): Observable<{ token: string; user: Utente }> {
    return this.api.post('utenti/login', { username, password });
  }

  // Allegati
  getAllegati(tipo: string, id: number): Observable<any[]> { return this.api.get(`allegati?tipo=${tipo}&id=${id}`); }
  deleteAllegato(id: number): Observable<any> { return this.api.delete(`allegati/${id}`); }

  // Fatture Ricorrenti
  getFattureRicorrenti(): Observable<any[]> { return this.api.get('fatture-ricorrenti'); }
  createFatturaRicorrente(f: any): Observable<any> { return this.api.post('fatture-ricorrenti', f); }
  updateFatturaRicorrente(f: any): Observable<any> { return this.api.put(`fatture-ricorrenti/${f.id}`, f); }
  deleteFatturaRicorrente(id: number): Observable<any> { return this.api.delete(`fatture-ricorrenti/${id}`); }
  emettiFatturaRicorrente(id: number): Observable<any> { return this.api.post(`fatture-ricorrenti/${id}/emetti`, {}); }

  // SDI
  inviaFatturaSdi(id: number): Observable<any> { return this.api.post(`fattura-xml/${id}/invia-sdi`, {}); }

  // Note Rapide
  getNoteRapide(): Observable<NotaRapida[]> { return this.api.get('note-rapide'); }
  createNotaRapida(n: NotaRapida): Observable<any> { return this.api.post('note-rapide', n); }
  updateNotaRapida(n: NotaRapida): Observable<any> { return this.api.put(`note-rapide/${n.id}`, n); }
  deleteNotaRapida(id: number): Observable<any> { return this.api.delete(`note-rapide/${id}`); }

  // Catena documentale
  preventivoToDdt(id: number): Observable<{ id: number; numero: string }> {
    return this.api.post(`preventivi/${id}/to-ddt`, {});
  }
  preventivoToOrdine(id: number): Observable<{ id: number; numero: string }> {
    return this.api.post(`preventivi/${id}/to-ordine`, {});
  }
  ddtToFattura(id: number): Observable<{ id: number; numero: string }> {
    return this.api.post(`ddt/${id}/to-fattura`, {});
  }
  ordineToDD(id: number): Observable<{ id: number; numero: string }> {
    return this.api.post(`ordini/${id}/to-ddt`, {});
  }

  lookupPiva(piva: string): Observable<{ pIva: string; ragioneSociale: string | null; via: string | null; cap: string | null; citta: string | null; provincia: string | null; stato: string }> {
    return this.api.get(`piva/${piva.replace(/\s/g, '')}`);
  }

  checkPivaDuplicate(piva: string, tipo: 'clienti' | 'fornitori', excludeId?: number): Observable<{ exists: boolean; id?: number }> {
    const params = excludeId != null ? `piva=${piva}&excludeId=${excludeId}` : `piva=${piva}`;
    return this.api.get(`${tipo}/check-piva?${params}`);
  }

  searchAziendaByName(q: string): Observable<any[]> {
    return this.api.get(`piva/search-name?q=${encodeURIComponent(q)}`);
  }

  searchGlobal(q: string): Observable<{ clienti: any[]; fornitori: any[]; prodotti: any[]; fatture: any[]; ddt: any[]; ordini: any[]; preventivi: any[] }> {
    return this.api.get(`search?q=${encodeURIComponent(q)}`);
  }

  // Prima Nota
  getPrimaNota(mese?: string): Observable<any> { return this.api.get(`prima-nota${mese ? '?mese=' + mese : ''}`); }
  createPrimaNotaEntry(e: any): Observable<any> { return this.api.post('prima-nota', e); }
  updatePrimaNotaEntry(e: any): Observable<any> { return this.api.put(`prima-nota/${e.id}`, e); }
  deletePrimaNotaEntry(id: number): Observable<any> { return this.api.delete(`prima-nota/${id}`); }

  // Bug Reports
  getBugReports(): Observable<any[]> { return this.api.get('bug-reports'); }
  createBugReport(r: { titolo: string; descrizione: string; pagina?: string; priorita?: string }): Observable<any> { return this.api.post('bug-reports', r); }
  resolveBugReport(id: number): Observable<any> { return this.api.patch(`bug-reports/${id}/risolto`, {}); }
  reopenBugReport(id: number): Observable<any> { return this.api.patch(`bug-reports/${id}/riapri`, {}); }
  deleteBugReport(id: number): Observable<any> { return this.api.delete(`bug-reports/${id}`); }
}
