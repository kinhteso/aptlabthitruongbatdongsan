# Dockerfile cho Ứng dụng Web Next.js 15 PropValue.AI (RWD + PWA + Google Auth, Port mặc định 3359)
FROM node:20-alpine AS builder
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/kinhteso/aptlabbatdongsan"
LABEL org.opencontainers.image.description="PropValue.AI Next.js 15 RWD + PWA + Google OAuth Frontend (Port 3359)"

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3359 \
    HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3359
CMD ["node", "server.js"]
