FROM node:20-bookworm-slim

ENV TZ=Asia/Shanghai
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata curl tar ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p data uploads

ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]
