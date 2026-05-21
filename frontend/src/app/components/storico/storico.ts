import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../services/api.service';

interface AuditEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  createdAt: string;
}

@Component({
  selector: 'app-storico',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSelectModule, MatIconModule, MatButtonModule, MatTableModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Storico modifiche</h1>
        <button mat-stroked-button type="button" (click)="load()"><mat-icon>refresh</mat-icon> Aggiorna</button>
      </div>

      <div class="filter-bar">
        <mat-select [(ngModel)]="filtroEntity" (selectionChange)="applyFilter()" placeholder="Tipo entita">
          <mat-option [value]="null">Tutti</mat-option>
          @for (t of tipi; track t) { <mat-option [value]="t">{{ t }}</mat-option> }
        </mat-select>
        <mat-select [(ngModel)]="filtroAction" (selectionChange)="applyFilter()" placeholder="Azione">
          <mat-option [value]="null">Tutte</mat-option>
          <mat-option value="CREATE">Create</mat-option>
          <mat-option value="UPDATE">Update</mat-option>
          <mat-option value="DELETE">Delete</mat-option>
        </mat-select>
      </div>

      <div class="card">
        @if (!filtered.length) {
          <p class="empty-msg">Nessuna modifica registrata.</p>
        } @else {
          <table class="audit-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Entita</th>
                <th>ID</th>
                <th>Azione</th>
                <th>Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              @for (e of filtered; track e.id) {
                <tr>
                  <td class="when">{{ formatDate(e.createdAt) }}</td>
                  <td><b>{{ e.entityType }}</b></td>
                  <td>#{{ e.entityId }}</td>
                  <td>
                    <span class="action-chip" [class]="'action-' + e.action.toLowerCase()">{{ e.action }}</span>
                  </td>
                  <td class="payload">{{ summarizePayload(e) }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    .audit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .audit-table th { background: var(--bg-surface-2); padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-tertiary); border-bottom: 1px solid var(--border-subtle); }
    .audit-table td { padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); vertical-align: top; }
    .when { white-space: nowrap; color: var(--text-secondary); font-size: 12px; }
    .payload { color: var(--text-secondary); font-size: 12px; max-width: 480px; word-break: break-word; }
    .action-chip { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .action-create { background: #dcfce7; color: #16a34a; }
    .action-update { background: #dbeafe; color: #2563eb; }
    .action-delete { background: #fee2e2; color: #dc2626; }
    @media (max-width: 600px) {
      .audit-table th, .audit-table td { padding: 8px 6px; }
      .payload { display: none; }
    }
  `]
})
export class StoricoComponent implements OnInit {
  entries: AuditEntry[] = [];
  filtered: AuditEntry[] = [];
  filtroEntity: string | null = null;
  filtroAction: string | null = null;
  get tipi(): string[] { return [...new Set(this.entries.map(e => e.entityType))].sort(); }

  constructor(private api: ApiService) {}

  ngOnInit() { this.load(); }

  load() {
    this.api.get<AuditEntry[]>('audit/recent?limit=200').subscribe({
      next: rows => { this.entries = rows || []; this.applyFilter(); },
      error: () => { this.entries = []; this.filtered = []; }
    });
  }

  applyFilter() {
    let data = this.entries;
    if (this.filtroEntity) data = data.filter(e => e.entityType === this.filtroEntity);
    if (this.filtroAction) data = data.filter(e => e.action === this.filtroAction);
    this.filtered = data;
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  summarizePayload(e: AuditEntry): string {
    const p = e.payload || {};
    const parts: string[] = [];
    if (p.numero) parts.push(`n. ${p.numero}`);
    if (p.stato) parts.push(`stato ${p.stato}`);
    if (p.before && p.after) {
      const changes: string[] = [];
      for (const k of Object.keys(p.after)) {
        if (p.before[k] !== p.after[k]) changes.push(`${k}: ${JSON.stringify(p.before[k])} -> ${JSON.stringify(p.after[k])}`);
      }
      if (changes.length) parts.push(changes.join(', '));
    }
    if (!parts.length) return JSON.stringify(p);
    return parts.join(' · ');
  }
}
