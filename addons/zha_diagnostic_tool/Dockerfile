ARG BUILD_ARCH=amd64
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base:3.22

SHELL ["/bin/ash", "-o", "pipefail", "-c"]

RUN apk add --no-cache bash jq coreutils grep

COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
