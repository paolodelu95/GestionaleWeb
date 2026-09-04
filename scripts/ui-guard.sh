#!/usr/bin/env bash
# Presidio anti-regressione per la qualità UI/UX (§7 del workflow).
#
# Le bonifiche di Fase B si disfano da sole se nulla le protegge — è già successo:
# M2 (popup nativi) era stato dichiarato "0 ✅" e sono rientrati due volte, l'ultima
# volta 9 punti in 6 file mai coperti dal primo giro di audit.
#
# USO
#   ./scripts/ui-guard.sh          # solo i controlli bloccanti (exit 1 se falliscono)
#   ./scripts/ui-guard.sh --all    # anche i controlli informativi (mai bloccanti)
#
# Va lanciato prima di ogni release, insieme a `ng build`. Vedi
# docs/UI-UX-QUALITY-WORKFLOW.md §7 per il perché di ogni regola.

set -uo pipefail
cd "$(dirname "$0")/.."

FRONTEND=frontend/src/app
RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; DIM='\033[2m'; BOLD='\033[1m'; RESET='\033[0m'

fail=0
mostra_tutto=0
[ "${1:-}" = "--all" ] && mostra_tutto=1

echo -e "${BOLD}ui-guard — controlli anti-regressione${RESET}\n"

# ── 1. Popup di sistema nativi — BLOCCANTE (deve essere 0) ──────────────────────
# alert()/confirm()/prompt() sono fuori tema e sostituiti da ConfirmService
# (frontend/src/app/components/shared/confirm-dialog.ts): ask/alert/askTyping/prompt.
native_popups=$(grep -rEn '\bwindow\.(alert|confirm|prompt)\(' "$FRONTEND" --include='*.ts' 2>/dev/null \
  | grep -vE ':[0-9]+: *(\*|//)')
n_popups=$(echo -n "$native_popups" | grep -c . || true)
if [ "$n_popups" -gt 0 ]; then
  echo -e "${RED}✗ popup nativi (alert/confirm/prompt): $n_popups${RESET}"
  echo "$native_popups" | sed 's/^/    /'
  fail=1
else
  echo -e "${GREEN}✓ popup nativi: 0${RESET}"
fi

# ── 2. Bottoni-icona senza aria-label o title — informativo ─────────────────────
# Il grep sovrastima: `title` è un nome accessibile valido quanto `aria-label`, e
# l'attributo può stare su una riga diversa da `mat-icon-button`. La misura vera si
# fa sul DOM reso (vedi la sonda in HANDOFF-UI-UX.md o scripts/preview-smoke.mjs);
# qui è solo un segnale grezzo per accorgersi di un bottone platealmente senza nome
# né lì né altrove sulle righe vicine.
if [ "$mostra_tutto" = 1 ]; then
  icon_btns_sospetti=$(grep -rEn 'mat-icon-button' "$FRONTEND" --include='*.ts' --include='*.html' 2>/dev/null \
    | grep -viE 'aria-label|title=|matTooltip')
  n_icon=$(echo -n "$icon_btns_sospetti" | grep -c . || true)
  if [ "$n_icon" -gt 0 ]; then
    echo -e "${YELLOW}~ bottoni-icona senza aria-label/title/matTooltip sulla stessa riga: $n_icon${RESET} ${DIM}(informativo — verificare a video, non solo col grep)${RESET}"
  else
    echo -e "${GREEN}✓ bottoni-icona: nessun sospetto grezzo${RESET}"
  fi
fi

# ── 3. Colori esadecimali fuori dai token — informativo (B.4 non ancora fatta) ──
# Obiettivo: nessun colore letterale fuori da styles.scss. Oggi il numero è alto
# perché B.4 (pass sui token colore) non è ancora stata eseguita: non bloccante
# finché non lo è, altrimenti il presidio impedirebbe qualunque commit.
if [ "$mostra_tutto" = 1 ]; then
  hex_scss=$(grep -rlEo '#[0-9a-fA-F]{3,8}\b' "$FRONTEND" --include='*.scss' 2>/dev/null | wc -l | tr -d ' ')
  echo -e "${YELLOW}~ file .scss di componenti con colori esadecimali: $hex_scss${RESET} ${DIM}(informativo — B.4, non ancora fatta)${RESET}"
fi

# ── 4. Scritture senza ramo error: — informativo (mitigato da GlobalErrorHandler) ─
# M3 storico: subscribe di scrittura senza `error:` che falliscono in silenzio.
# Da B.1, gli errori non gestiti arrivano comunque a GlobalErrorHandler e mostrano
# una snackbar — quindi non è più un difetto invisibile, ma resta un'euristica
# grezza (conta solo le subscribe su una riga) utile da tenere d'occhio.
if [ "$mostra_tutto" = 1 ]; then
  subscribe_senza_error=$(grep -rEn '\.subscribe\(\(\) *=>' "$FRONTEND" --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
  echo -e "${YELLOW}~ .subscribe(() => …) su una riga senza ramo error: $subscribe_senza_error${RESET} ${DIM}(informativo — mitigato da GlobalErrorHandler/B.1)${RESET}"
fi

echo
if [ "$fail" = 1 ]; then
  echo -e "${RED}${BOLD}ui-guard: FALLITO${RESET} — correggi i punti bloccanti sopra prima di rilasciare."
  exit 1
else
  echo -e "${GREEN}${BOLD}ui-guard: OK${RESET}$([ "$mostra_tutto" = 0 ] && echo " ${DIM}(usa --all per i controlli informativi)${RESET}")"
fi
