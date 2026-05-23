FROM node:22-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3456
ENV DATABASE_PATH=/app/data/youtube_automation.db

RUN mkdir -p /app/data /app/logs /app/uploads

EXPOSE 3456

CMD ["npm", "start"]
