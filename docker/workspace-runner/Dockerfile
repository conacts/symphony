FROM node:24-bookworm-slim

ARG PI_VERSION=0.67.2
ARG LINEAR_CLI_VERSION=2.0.0
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
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

RUN npm install -g "@mariozechner/pi-coding-agent@${PI_VERSION}" "@schpet/linear-cli@${LINEAR_CLI_VERSION}" \
  && npm cache clean --force

ENV SYMPHONY_PI_RUNNER_ROOT=/opt/symphony/pi-runner
WORKDIR ${SYMPHONY_PI_RUNNER_ROOT}

COPY docker/workspace-runner/pi-runner.package.json ./package.json
RUN npm install --omit=dev \
  && npm cache clean --force

COPY packages/agent-harnesses/src ./src
COPY docker/workspace-runner/symphony-pi-runner /usr/local/bin/symphony-pi-runner
RUN chmod 0755 /usr/local/bin/symphony-pi-runner

ENV SYMPHONY_CONTAINER=1
WORKDIR /home/agent/workspace

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "-lc", "while :; do sleep 3600; done"]
