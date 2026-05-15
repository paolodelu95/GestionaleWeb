import { Injectable } from '@angular/core';
import { forkJoin } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DataService } from './data.service';
import { Azienda } from '../models';

const PR: [number, number, number] = [79, 70, 229];
const DK: [number, number, number] = [26, 26, 46];
const GR: [number, number, number] = [100, 116, 139];
const LG: [number, number, number] = [240, 242, 248];

const ML = 14, PW = 210, CW = PW - ML * 2;

@Injectable({ providedIn: 'root' })
export class PrintService {
  constructor(private ds: DataService) {}

  printFattura(id: number) {
    forkJoin({ doc: this.ds.getFatturaPrint(id), az: this.ds.getAzienda() }).subscribe(async ({ doc, az }) => {
      const logo = await this.resolveLogoInfo(az.logo);
      const pdf = new jsPDF('p', 'mm', 'a4');
      let y = this.hdr(pdf, az, 'FATTURA', '', doc.numero, doc.dataEmissione, logo);
      y = this.parties(pdf, y,
        { lbl: 'VENDITORE', name: az.ragioneSociale || '', lines: this.azLines(az) },
        { lbl: 'CLIENTE', name: doc.cliente?.ragioneSociale || '—', lines: this.contactLines(doc.cliente) }
      );
      y = this.table(pdf, y, doc.righe || []);
      y = this.totals(pdf, y, doc.righe || []);
      y = this.payment(pdf, y, doc, az);
      if (doc.note) y = this.noteBox(pdf, y, doc.note);
      this.footer(pdf, az);
      pdf.save(`Fattura_${doc.numero}.pdf`);
    });
  }

  printDdt(id: number) {
    forkJoin({ doc: this.ds.getDdtPrint(id), az: this.ds.getAzienda() }).subscribe(async ({ doc, az }) => {
      const logo = await this.resolveLogoInfo(az.logo);
      const pdf = new jsPDF('p', 'mm', 'a4');
      let y = this.hdr(pdf, az, 'DDT', 'Documento di Trasporto', doc.numero, doc.dataEmissione, logo);
      y = this.parties(pdf, y,
        { lbl: 'MITTENTE', name: az.ragioneSociale || '', lines: this.azLines(az) },
        { lbl: 'DESTINATARIO', name: doc.cliente?.ragioneSociale || '—', lines: this.ddtDestLines(doc) }
      );
      y = this.trasporto(pdf, y, doc);
      y = this.table(pdf, y, doc.righe || []);
      y = this.totals(pdf, y, doc.righe || []);
      if (doc.note) y = this.noteBox(pdf, y, doc.note);
      y = this.signatures(pdf, y);
      this.footer(pdf, az);
      pdf.save(`DDT_${doc.numero}.pdf`);
    });
  }

  printNotaCredito(id: number) {
    forkJoin({ doc: this.ds.getNotaCreditoPrint(id), az: this.ds.getAzienda() }).subscribe(async ({ doc, az }) => {
      const logo = await this.resolveLogoInfo(az.logo);
      const pdf = new jsPDF('p', 'mm', 'a4');
      let y = this.hdr(pdf, az, 'NOTA DI CREDITO', doc.fatturaNumeroColl ? `Rif. Fattura N. ${doc.fatturaNumeroColl}` : '', doc.numero, doc.dataEmissione, logo);
      y = this.parties(pdf, y,
        { lbl: 'EMITTENTE', name: az.ragioneSociale || '', lines: this.azLines(az) },
        { lbl: 'CLIENTE', name: doc.cliente?.ragioneSociale || '—', lines: this.contactLines(doc.cliente) }
      );
      y = this.table(pdf, y, doc.righe || []);
      y = this.totals(pdf, y, doc.righe || []);
      if (doc.note) y = this.noteBox(pdf, y, doc.note);
      this.footer(pdf, az);
      pdf.save(`NotaCredito_${doc.numero}.pdf`);
    });
  }

  printOrdine(id: number) {
    forkJoin({ doc: this.ds.getOrdinePrint(id), az: this.ds.getAzienda() }).subscribe(async ({ doc, az }) => {
      const isCliente = doc.tipo === 'CLIENTE';
      const logo = await this.resolveLogoInfo(az.logo);
      const pdf = new jsPDF('p', 'mm', 'a4');
      let y = this.hdr(pdf, az, 'ORDINE', isCliente ? 'Ordine cliente' : 'Ordine fornitore', doc.numero, doc.dataOrdine, logo);
      y = this.parties(pdf, y,
        { lbl: isCliente ? 'VENDITORE' : 'ACQUIRENTE', name: az.ragioneSociale || '', lines: this.azLines(az) },
        { lbl: isCliente ? 'CLIENTE' : 'FORNITORE', name: (isCliente ? doc.cliente?.ragioneSociale : doc.fornitore?.ragioneSociale) || '—', lines: this.contactLines(isCliente ? doc.cliente : doc.fornitore) }
      );
      y = this.table(pdf, y, doc.righe || []);
      y = this.totals(pdf, y, doc.righe || []);
      if (doc.note) y = this.noteBox(pdf, y, doc.note);
      this.footer(pdf, az);
      pdf.save(`Ordine_${doc.numero}.pdf`);
    });
  }

  printPreventivo(id: number) {
    forkJoin({ doc: this.ds.getPreventivoePrint(id), az: this.ds.getAzienda() }).subscribe(async ({ doc, az }) => {
      const logo = await this.resolveLogoInfo(az.logo);
      const pdf = new jsPDF('p', 'mm', 'a4');
      let y = this.hdr(pdf, az, 'PREVENTIVO', `Validità: ${doc.validita || 30} giorni`, doc.numero, doc.dataEmissione, logo);
      y = this.parties(pdf, y,
        { lbl: 'EMITTENTE', name: az.ragioneSociale || '', lines: this.azLines(az) },
        { lbl: 'CLIENTE', name: doc.cliente?.ragioneSociale || '—', lines: this.contactLines(doc.cliente) }
      );
      y = this.table(pdf, y, doc.righe || []);
      y = this.totals(pdf, y, doc.righe || []);
      if (doc.note) y = this.noteBox(pdf, y, doc.note);
      this.footer(pdf, az);
      pdf.save(`Preventivo_${doc.numero}.pdf`);
    });
  }

  printAcquisto(id: number) {
    forkJoin({ doc: this.ds.getAcquistoPrint(id), az: this.ds.getAzienda() }).subscribe(async ({ doc, az }) => {
      const logo = await this.resolveLogoInfo(az.logo);
      const pdf = new jsPDF('p', 'mm', 'a4');
      let y = this.hdr(pdf, az, 'ACQUISTO', '', doc.numero, doc.dataEmissione, logo);
      y = this.parties(pdf, y,
        { lbl: 'ACQUIRENTE', name: az.ragioneSociale || '', lines: this.azLines(az) },
        { lbl: 'FORNITORE', name: doc.fornitore?.ragioneSociale || '—', lines: this.contactLines(doc.fornitore) }
      );
      y = this.table(pdf, y, doc.righe || []);
      y = this.totals(pdf, y, doc.righe || []);
      y = this.payment(pdf, y, doc, az);
      if (doc.note) y = this.noteBox(pdf, y, doc.note);
      this.footer(pdf, az);
      pdf.save(`Acquisto_${doc.numero}.pdf`);
    });
  }

  // ── Layout primitives ──────────────────────────────────────────────────────

  private async resolveLogoInfo(logo?: string): Promise<{ src: string; fmt: string; w: number; h: number } | null> {
    if (!logo) return null;
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const maxW = 44, maxH = 18;
        const ratio = img.naturalWidth / img.naturalHeight;
        let w = maxW, h = maxW / ratio;
        if (h > maxH) { h = maxH; w = maxH * ratio; }
        const fmt = logo.startsWith('data:image/png') ? 'PNG'
          : logo.startsWith('data:image/gif') ? 'GIF' : 'JPEG';
        resolve({ src: logo, fmt, w, h });
      };
      img.onerror = () => resolve(null);
      img.src = logo;
    });
  }

  private hdr(doc: jsPDF, az: Azienda, type: string, subtitle: string, numero: string, data: string, logo: { src: string; fmt: string; w: number; h: number } | null = null): number {
    let y = ML;
    let lx = ML;

    if (logo) {
      try {
        doc.addImage(logo.src, logo.fmt, ML, y, logo.w, logo.h);
        lx = ML + logo.w + 4;
      } catch (_) {}
    }

    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DK);
    doc.text(az.ragioneSociale || '', lx, y + 7);

    const infoLines: string[] = [];
    const addr = [az.indirizzo, [az.cap, az.citta, az.provincia ? `(${az.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (addr) infoLines.push(addr);
    if (az.pIva) infoLines.push(`P.IVA: ${az.pIva}`);
    if (az.email) infoLines.push(az.email);
    if (az.telefono) infoLines.push(`Tel: ${az.telefono}`);

    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GR);
    let iy = y + 12;
    for (const line of infoLines) { doc.text(line, lx, iy); iy += 4; }

    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PR);
    doc.text(type, PW - ML, y + 8, { align: 'right' });

    if (subtitle) {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GR);
      doc.text(subtitle, PW - ML, y + 14, { align: 'right' });
    }

    const metaY = subtitle ? 20 : 15;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DK);
    doc.text(`N. ${numero}`, PW - ML, y + metaY, { align: 'right' });
    doc.text(`Del ${this.fd(data)}`, PW - ML, y + metaY + 5, { align: 'right' });

    y = Math.max(iy, y + 28) + 2;
    doc.setDrawColor(...PR); doc.setLineWidth(0.7);
    doc.line(ML, y, PW - ML, y);
    return y + 6;
  }

  private parties(doc: jsPDF, y: number, left: { lbl: string; name: string; lines: string[] }, right: { lbl: string; name: string; lines: string[] }): number {
    const bw = (CW / 2) - 3;
    const bh = Math.max(24 + left.lines.length * 4.2, 24 + right.lines.length * 4.2, 26);
    doc.setFillColor(...LG);
    doc.roundedRect(ML, y, bw, bh, 2, 2, 'F');
    doc.roundedRect(ML + bw + 6, y, bw, bh, 2, 2, 'F');

    const draw = (x: number, p: { lbl: string; name: string; lines: string[] }) => {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PR);
      doc.text(p.lbl, x + 4, y + 6);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DK);
      doc.text(p.name, x + 4, y + 12);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GR);
      let ly = y + 17;
      for (const line of p.lines) { if (line) { doc.text(line, x + 4, ly); ly += 4.2; } }
    };

    draw(ML, left);
    draw(ML + bw + 6, right);
    return y + bh + 6;
  }

  private table(doc: jsPDF, y: number, righe: any[]): number {
    const body = righe.map((r, i) => {
      const imp = (r.quantita || 0) * (r.prezzo || 0) * (1 - (r.sconto || 0) / 100);
      return [i + 1, r.descrizione || '', r.quantita ?? '', r.unitaMisura || '',
        r.prezzo ? this.fe(r.prezzo) : '—', r.sconto ? r.sconto + '%' : '—',
        r.iva + '%', imp ? this.fe(imp) : '—'];
    });
    autoTable(doc, {
      startY: y,
      head: [['#', 'Descrizione', 'Q.tà', 'UM', 'Prezzo', 'Sc.%', 'IVA', 'Importo']],
      body,
      theme: 'striped',
      headStyles: { fillColor: PR, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: DK },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 'auto' },
        2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 12 },
        4: { cellWidth: 22, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 14, halign: 'right' }, 7: { cellWidth: 24, halign: 'right' },
      },
      margin: { left: ML, right: ML },
    });
    return (doc as any).lastAutoTable.finalY + 4;
  }

  private totals(doc: jsPDF, y: number, righe: any[]): number {
    const ivaMap = new Map<number, { imp: number; iva: number }>();
    let imponibile = 0, ivaTotal = 0;
    for (const r of righe) {
      const imp = (r.quantita || 0) * (r.prezzo || 0) * (1 - (r.sconto || 0) / 100);
      const ivaAmt = imp * ((r.iva || 0) / 100);
      imponibile += imp; ivaTotal += ivaAmt;
      const ex = ivaMap.get(r.iva) || { imp: 0, iva: 0 };
      ivaMap.set(r.iva, { imp: ex.imp + imp, iva: ex.iva + ivaAmt });
    }

    if (ivaMap.size > 1) {
      autoTable(doc, {
        startY: y,
        head: [['Aliquota', 'Imponibile', 'IVA']],
        body: [...ivaMap.entries()].map(([a, v]) => [`${a}%`, this.fe(v.imp), this.fe(v.iva)]),
        theme: 'plain',
        headStyles: { fillColor: LG, textColor: DK, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        tableWidth: 80, margin: { left: PW - ML - 80 },
      });
      y = (doc as any).lastAutoTable.finalY + 3;
    }

    const tx = PW - ML - 70;
    doc.setFontSize(9);
    for (const [lbl, val] of [['Imponibile', this.fe(imponibile)], ['IVA', this.fe(ivaTotal)]]) {
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...GR); doc.text(lbl, tx, y);
      doc.setTextColor(...DK); doc.text(val, PW - ML, y, { align: 'right' });
      doc.setDrawColor(220, 225, 230); doc.setLineWidth(0.2);
      doc.line(tx, y + 1, PW - ML, y + 1);
      y += 6;
    }

    doc.setFillColor(...PR);
    doc.rect(tx - 2, y - 3, PW - ML - tx + 2, 8, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('TOTALE', tx, y + 2);
    doc.text(this.fe(imponibile + ivaTotal), PW - ML, y + 2, { align: 'right' });
    return y + 12;
  }

  private payment(doc: jsPDF, y: number, docData: any, az: Azienda): number {
    y = this.secTitle(doc, y, 'Modalità di pagamento');
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DK);
    if (docData.tipoPagamentoNome) { doc.text(`Modalità: ${docData.tipoPagamentoNome}`, ML, y); y += 5; }
    if (az.iban) { doc.text(`IBAN: ${az.iban}${az.banca ? ` — ${az.banca}` : ''}`, ML, y); y += 5; }

    const pags = docData.pagamenti || [];
    if (pags.length) {
      y += 2; y = this.secTitle(doc, y, 'Pagamenti registrati');
      autoTable(doc, {
        startY: y,
        head: [['Data', 'Metodo', 'Importo', 'Note']],
        body: pags.map((p: any) => [this.fd(p.dataPagamento), p.metodo || '—', this.fe(p.importo), p.note || '']),
        theme: 'plain',
        headStyles: { fillColor: LG, textColor: DK, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' } },
        margin: { left: ML, right: ML },
      });
      y = (doc as any).lastAutoTable.finalY + 3;
    }
    return y;
  }

  private trasporto(doc: jsPDF, y: number, ddt: any): number {
    y = this.secTitle(doc, y, 'Dati trasporto');
    const dest = ddt.destinazioneDiversa || [ddt.cliente?.via, [ddt.cliente?.cap, ddt.cliente?.citta].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const fields: [string, string][] = [
      ['Causale', ddt.causaleTrasporto], ['Aspetto beni', ddt.aspettoBeni],
      ['Porto', ddt.porto], ['N. Colli', ddt.numeroColli ? String(ddt.numeroColli) : ''],
      ['Peso lordo', ddt.pesoLordo ? ddt.pesoLordo + ' kg' : ''],
      ['Incaricato', ddt.incaricatoTrasporto], ['Vettore', ddt.vettore || ''],
      ['Data/ora inizio', ddt.dataOraInizioTrasporto ? this.fd(ddt.dataOraInizioTrasporto.substring(0, 10)) + (ddt.dataOraInizioTrasporto.length > 10 ? ' ' + ddt.dataOraInizioTrasporto.substring(11, 16) : '') : ''],
      ['Destinazione', dest || ''],
    ].filter(([, v]) => v) as [string, string][];

    const hw = CW / 2;
    doc.setFontSize(8.5);
    let col = 0, ry = y;
    for (const [lbl, val] of fields) {
      const x = ML + col * (hw + 3);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...GR); doc.text(lbl + ':', x, ry);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DK); doc.text(val, x + 36, ry);
      col++; if (col === 2) { col = 0; ry += 5.5; }
    }
    if (col === 1) ry += 5.5;
    if (ddt.noteTrasporto) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GR);
      doc.text(`Note: ${ddt.noteTrasporto}`, ML, ry); ry += 5;
    }
    return ry + 3;
  }

  private signatures(doc: jsPDF, y: number): number {
    if (y > 250) { doc.addPage(); y = ML; }
    y += 12;
    const sw = (CW - 12) / 3;
    for (let i = 0; i < 3; i++) {
      const x = ML + i * (sw + 6);
      doc.setDrawColor(150, 160, 170); doc.setLineWidth(0.3);
      doc.line(x, y, x + sw, y);
      doc.setFontSize(8); doc.setTextColor(...GR);
      doc.text(['Firma mittente', 'Firma vettore', 'Firma destinatario'][i], x + sw / 2, y + 4.5, { align: 'center' });
    }
    return y + 10;
  }

  private noteBox(doc: jsPDF, y: number, note: string): number {
    y = this.secTitle(doc, y, 'Note');
    const lines = doc.splitTextToSize(note, CW - 8) as string[];
    const bh = lines.length * 5 + 6;
    doc.setFillColor(255, 251, 235); doc.setDrawColor(253, 230, 138); doc.setLineWidth(0.3);
    doc.rect(ML, y - 2, CW, bh, 'FD');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DK);
    doc.text(lines, ML + 4, y + 3);
    return y + bh + 4;
  }

  private secTitle(doc: jsPDF, y: number, title: string): number {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PR);
    doc.text(title.toUpperCase(), ML, y);
    const tw = doc.getTextWidth(title.toUpperCase());
    doc.setDrawColor(200, 205, 240); doc.setLineWidth(0.2);
    doc.line(ML + tw + 2, y - 1, PW - ML, y - 1);
    return y + 5;
  }

  private footer(doc: jsPDF, az: Azienda) {
    const parts = [az.ragioneSociale, az.pIva ? `P.IVA ${az.pIva}` : '', az.codFiscale ? `C.F. ${az.codFiscale}` : '', az.pec ? `PEC: ${az.pec}` : '', az.sdi ? `SDI: ${az.sdi}` : ''].filter(Boolean).join('  —  ');
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(220, 225, 230); doc.setLineWidth(0.2); doc.line(ML, 285, PW - ML, 285);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GR);
      doc.text(parts, PW / 2, 290, { align: 'center' });
      doc.text(`${i} / ${n}`, PW - ML, 290, { align: 'right' });
    }
  }

  // ── Data helpers ───────────────────────────────────────────────────────────

  private azLines(az: Azienda): string[] {
    return [
      [az.indirizzo, [az.cap, az.citta, az.provincia ? `(${az.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      az.pIva ? `P.IVA: ${az.pIva}` : '',
      az.iban ? `IBAN: ${az.iban}` : '',
    ].filter(Boolean) as string[];
  }

  private contactLines(c: any): string[] {
    if (!c) return [];
    return [
      [c.via, [c.cap, c.citta, c.provincia ? `(${c.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      c.pIva ? `P.IVA: ${c.pIva}` : '',
      c.codFiscale ? `C.F.: ${c.codFiscale}` : '',
      c.email || '',
      c.telefono ? `Tel: ${c.telefono}` : '',
    ].filter(Boolean) as string[];
  }

  private ddtDestLines(ddt: any): string[] {
    if (ddt.destinazioneDiversa) return [ddt.destinazioneDiversa, ddt.cliente?.pIva ? `P.IVA: ${ddt.cliente.pIva}` : ''].filter(Boolean) as string[];
    return this.contactLines(ddt.cliente);
  }

  private fd(s: string): string {
    if (!s) return '—';
    const p = (s || '').substring(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
  }

  private fe(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n ?? 0);
  }
}
