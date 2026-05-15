# ── Stage 1: build Angular ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: production server ────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./

# Copy Angular build output into backend/public
COPY --from=frontend-build /app/dist/frontend/browser ./public

EXPOSE 3000
CMD ["node", "server.js"]
