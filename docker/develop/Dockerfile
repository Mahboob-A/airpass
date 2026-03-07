# docker/develop/Dockerfile
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install uv 
RUN pip install uv --no-cache-dir

# Copy dependency manifest first
COPY backend/requirements.txt .

# Install dependencies
RUN uv pip install --system -r requirements.txt

# Do not copy backend/ . here — it will be mounted via docker-compose
EXPOSE 8000

# Run the app with reload enabled for development
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
