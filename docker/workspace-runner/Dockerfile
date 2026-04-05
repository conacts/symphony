FROM node:24-bookworm-slim

ARG CODEX_VERSION=0.117.0
ARG OPENCODE_VERSION=1.3.15
ARG PNPM_VERSION=10.32.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    gh \
    git \
    g++ \
    jq \
    less \
    make \
    openssh-client \
    postgresql-client \
    procps \
    python3 \
    ripgrep \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

RUN npm install -g "@openai/codex@${CODEX_VERSION}" \
  && npm install -g "opencode-ai@${OPENCODE_VERSION}" \
  && npm cache clean --force

ENV SYMPHONY_CONTAINER=1
WORKDIR /home/agent/workspace

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "-lc", "while :; do sleep 3600; done"]
