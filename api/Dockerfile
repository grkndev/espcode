FROM node:22-bookworm-slim AS build
# Prisma engine seçimi openssl sürümünü tespit edemezse yanlış varyantı
# indirir (openssl-1.1.x) — slim imajda openssl CLI'ı yok, bookworm'un
# gerçek OpenSSL 3.0.x'i algılansın diye ekleniyor.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
# prisma generate DB'ye bağlanmaz, yalnızca schema'dan client kodu üretir —
# gerçek DATABASE_URL derleme aşamasında gerekmiyor.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 10002 api
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# migrate deploy'u container içinden çalıştırabilmek için (host'ta Node/Prisma
# CLI olmayan bir VPS'te tek migration yolu bu).
COPY prisma.config.ts ./
COPY prisma ./prisma
# ide_artifacts named volume ilk kez bağlandığında Docker bu dizinin imajdaki
# içeriğini (ve sahipliğini) volume'e kopyalar — api kullanıcısına yazma
# izni burada verilmezse artifact-store.ts EACCES ile patlar.
RUN mkdir -p /var/lib/espcode/artifacts && chown -R api:api /var/lib/espcode/artifacts
USER api
CMD ["node", "dist/main.js"]
