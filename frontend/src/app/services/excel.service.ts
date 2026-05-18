import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

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
