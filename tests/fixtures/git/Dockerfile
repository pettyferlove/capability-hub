FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-server ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /usr/bin/git-shell git \
    && passwd -d git \
    && mkdir -p /home/git/.ssh /run/sshd /repositories \
    && chown -R git:git /home/git /repositories \
    && chmod 700 /home/git/.ssh
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
