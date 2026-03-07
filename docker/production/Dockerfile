# docker/production/Dockerfile
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install uv
RUN pip install uv --no-cache-dir

# Copy dependency manifest
COPY backend/requirements.txt .

# Install dependencies
RUN uv pip install --system -r requirements.txt

# Copy the application source code
COPY backend/ .

EXPOSE 8000

# Health check — ensures service runs correctly before Nginx routing happens
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Run the application optimized
CMD ["uvicorn", "main:app", \
    "--host", "0.0.0.0", \
    "--port", "8000", \
    "--no-access-log", \
    "--workers", "1"]
