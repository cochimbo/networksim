FROM rust:1.82-bullseye AS builder
WORKDIR /usr/src/testdistributed_app
COPY . .

RUN apt-get update && apt-get install -y --no-install-recommends pkg-config ca-certificates libssl-dev curl build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install rustup and set nightly as default to support crates requiring edition2024
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain nightly \
    && . /usr/local/cargo/env \
    && rustc --version && cargo --version

ENV PATH="/usr/local/cargo/bin:${PATH}"

RUN rm -f Cargo.lock || true
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl iputils-ping \
    && update-ca-certificates || true \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/testdistributed_app/target/release/testdistributed_app /usr/local/bin/testdistributed_app
EXPOSE 9090
ENV RUST_LOG=info
CMD ["/usr/local/bin/testdistributed_app"]
