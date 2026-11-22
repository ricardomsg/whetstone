# Whetstone — one container: SvelteKit (adapter-node) + SQLite on a volume.

# The word-frequency lexicon is built here from wordfreq rather than stored in the repository.
FROM python:3.12-slim AS lexicon
WORKDIR /app
COPY seed/scripts/lexicon.py seed/scripts/lexicon.py
RUN pip install --no-cache-dir wordfreq==3.1.1 && python seed/scripts/lexicon.py

FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 WS_DATA_DIR=/data \
    WS_MIGRATIONS_DIR=/app/src/lib/server/db/migrations WS_RUBRICS_DIR=/app/rubrics WS_CONTENT_DIR=/app/content
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/src/lib/server/db/migrations ./src/lib/server/db/migrations
COPY --from=build /app/rubrics ./rubrics
COPY --from=build /app/content ./content
COPY --from=build /app/seed ./seed
COPY --from=lexicon /app/seed/lexicon ./seed/lexicon
COPY --from=build /app/LICENSE /app/NOTICE.md ./
COPY --from=build /app/licenses ./licenses
COPY --from=build /app/cli ./cli
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node seed/load.mjs && node build/index.js"]
