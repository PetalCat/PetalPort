FROM snowdreamtech/frpc:latest AS frpc

FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache ca-certificates wireguard-tools iptables openresolv ip6tables

# Copy frpc binary
COPY --from=frpc /usr/bin/frpc /usr/bin/frpc

WORKDIR /app

# Install wrapper dependencies
COPY package.json .
RUN npm install --production

# Copy wrapper code
COPY wrapper.js .

# Default configuration directory for FRP
RUN mkdir -p /etc/frp

# Start wrapper
CMD ["npm", "start"]
