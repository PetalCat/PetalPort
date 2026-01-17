FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm && \
    apk add --no-cache wireguard-tools

# Install dependencies first (cached)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Copy source
COPY . .

EXPOSE 5173

CMD ["pnpm", "dev", "--host"]
