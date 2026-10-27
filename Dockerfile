FROM node:20-alpine
# 安装时区数据（Alpine 默认没有）
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p data uploads
ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]
