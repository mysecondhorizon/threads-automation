FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends -y ffmpeg \
  && rm -rf /var/lib/apt/lists/*

CMD ["sleep", "infinity"]
