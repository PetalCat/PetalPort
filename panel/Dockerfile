FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm && apk add --no-cache util-linux

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

RUN pnpm build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8456

EXPOSE 8456

CMD ["node", "build"]
