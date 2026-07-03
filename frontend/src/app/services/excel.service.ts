import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExcelColumn<T> {
  header: string;
  field: keyof T;
  width?: number;
}

@Injectable({ providedIn: 'root' })
export class ExcelService {

  export<T>(data: T[], columns: ExcelColumn<T>[], filename: string): void {
    const rows = data.map(item =>
      Object.fromEntries(columns.map(c => [c.header, (item as any)[c.field] ?? '']))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = columns.map(c => ({ wch: c.width ?? 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dati');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }

  /** Esporta in CSV (separatore ';' per compatibilità con Excel in locale IT, BOM UTF-8). */
  exportCsv<T>(data: T[], columns: ExcelColumn<T>[], filename: string): void {
    const sep = ';';
    const esc = (v: any): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return /["\n\r;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map(c => esc(c.header)).join(sep);
    const body = data.map(item => columns.map(c => esc((item as any)[c.field] ?? '')).join(sep));
    const csv = '﻿' + [header, ...body].join('\r\n');
    this.download(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
  }

  /** Esporta in PDF una tabella con intestazioni (orizzontale se molte colonne). */
  exportPdf<T>(data: T[], columns: ExcelColumn<T>[], filename: string, title?: string): void {
    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
    if (title) { doc.setFontSize(14); doc.text(title, 40, 40); }
    autoTable(doc, {
      startY: title ? 58 : 40,
      head: [columns.map(c => c.header)],
      body: data.map(item => columns.map(c => {
        const v = (item as any)[c.field];
        return v === null || v === undefined ? '' : String(v);
      })),
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [17, 118, 155] },
      margin: { left: 40, right: 40 },
    });
    doc.save(`${filename}.pdf`);
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  readFile(file: File): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
}
