# Imagem de produção (Cloud Run ou qualquer servidor com Docker)
FROM node:24-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npx prisma generate && npx next build

# CLI do Prisma com todas as dependências, isolada do app, para rodar
# "migrate deploy" (atualizar o banco) a cada inicialização.
FROM node:24-alpine AS migrator
RUN apk add --no-cache openssl
WORKDIR /cli
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund prisma@6.19.3

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata openssl && addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
# Cliente Prisma e motor de consultas usados pelo app
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=migrator /cli /cli
USER app
EXPOSE 8080
CMD ["sh", "-c", "node /cli/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma && node server.js"]
