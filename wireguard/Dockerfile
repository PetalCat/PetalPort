FROM alpine:3.19

RUN apk add --no-cache wireguard-tools iptables iproute2 bash

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
