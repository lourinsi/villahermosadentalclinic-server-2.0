FROM node:20-bookworm-slim

WORKDIR /app

ENV PORT=3001
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/villahermosa

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run prisma:generate && npm run build

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "docker-entrypoint.js"]
