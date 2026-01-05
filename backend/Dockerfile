# Build stage
FROM rust:1-bookworm as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a new empty shell project
RUN USER=root cargo new --bin networksim-backend
WORKDIR /app/networksim-backend

# Copy manifests
COPY ./Cargo.toml ./Cargo.lock ./

# Create dummy bench file to satisfy Cargo.toml
RUN mkdir benches && echo "fn main() {}" > benches/benchmarks.rs

# Build only the dependencies to cache them
RUN cargo build --release
RUN rm src/*.rs

# Copy the source code
COPY ./src ./src
COPY ./migrations ./migrations

# Build for release
RUN touch src/main.rs
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
COPY --from=builder /app/networksim-backend/target/release/networksim-backend /usr/local/bin/

# Copy configuration and migrations if needed at runtime
COPY --from=builder /app/networksim-backend/migrations ./migrations
# If you have a config file, copy it here too
# COPY config ./config

# Create data directory for SQLite
RUN mkdir -p /app/data
ENV DATABASE_URL=sqlite:///app/data/networksim.db

# Create a non-root user
RUN useradd -m -u 1000 -U -s /bin/sh -d /app networksim && \
    chown -R networksim:networksim /app

# Switch to non-root user
USER networksim

# Expose port
EXPOSE 8080

# Run the binary
CMD ["networksim-backend"]
