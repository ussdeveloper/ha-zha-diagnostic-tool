ARG BUILD_ARCH=amd64
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base:3.22

SHELL ["/bin/ash", "-o", "pipefail", "-c"]

RUN apk add --no-cache bash jq coreutils grep python3 py3-aiohttp

COPY run.sh /run.sh
RUN chmod a+x /run.sh

COPY app /app

CMD ["/run.sh"]
