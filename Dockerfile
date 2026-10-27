FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# 数据目录
RUN mkdir -p /app/data /app/uploads
VOLUME ["/app/data", "/app/uploads"]
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
