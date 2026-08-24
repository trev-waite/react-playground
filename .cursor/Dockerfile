# Base image for the React Playground Cloud Agent environment.
# oven/bun ships the pinned Bun runtime + bundler at /usr/local/bin (globally on PATH).
# git is added for Cloud Agent version-control operations; the repository is checked
# out by Cursor separately, so nothing is copied into the image here.
FROM oven/bun:1.4.0-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && bun --version

# Cursor supplies its own command when booting the agent; drop the base image's
# bun entrypoint so it does not wrap those commands.
ENTRYPOINT []
