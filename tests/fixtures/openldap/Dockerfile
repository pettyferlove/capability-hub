FROM debian:bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends slapd ldap-utils \
    && rm -rf /var/lib/apt/lists/*
COPY slapd.conf directory.ldif /fixture/
RUN install -d -o openldap -g openldap /fixture/data \
    && slapadd -f /fixture/slapd.conf -l /fixture/directory.ldif \
    && chown -R openldap:openldap /fixture/data
USER openldap
CMD ["slapd", "-f", "/fixture/slapd.conf", "-h", "ldap://0.0.0.0:1389/", "-d", "0"]
