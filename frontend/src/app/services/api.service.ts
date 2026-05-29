import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { timeout, retry } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.base}/${path}`).pipe(
      timeout(30000),
      // Riprova SOLO su errori di rete/timeout (GET idempotente), non su 4xx/5xx.
      retry({ count: 2, delay: (err, n) => {
        const transient = err?.status === 0 || err?.name === 'TimeoutError';
        if (!transient) throw err;
        return timer(500 * Math.pow(2, n));
      } }),
    );
  }
  post<T>(path: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.base}/${path}`, body);
  }
  put<T>(path: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.base}/${path}`, body);
  }
  patch<T>(path: string, body: any): Observable<T> {
    return this.http.patch<T>(`${this.base}/${path}`, body);
  }
  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}/${path}`);
  }
  /** GET binario con Authorization header — usato per download file (XML, CSV, ecc.). */
  getBlob(path: string): Observable<Blob> {
    return this.http.get(`${this.base}/${path}`, { responseType: 'blob' });
  }
}
