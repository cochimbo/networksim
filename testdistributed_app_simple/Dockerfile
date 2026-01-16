FROM python:3.12-alpine
WORKDIR /app
COPY main.py .
# Environment variables with defaults
ENV MESSAGE="default-node"
ENV PERIOD="2.0"
ENV PORT="37020"

# -u forces stdout and stderr to be unbuffered
CMD ["python", "-u", "main.py"]
