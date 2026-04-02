FROM node:24-bookworm-slim

ARG PNPM_VERSION=10.32.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    g++ \
    make \
    openssh-client \
    postgresql-client \
    python3 \
    ripgrep \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

ENV SYMPHONY_CONTAINER=1
WORKDIR /home/agent/workspace

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "-lc", "while :; do sleep 3600; done"]
