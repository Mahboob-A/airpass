#!/usr/bin/env bash
# scripts/generate-dev-certs.sh
# Generates self-signed SSL certificates for local HTTPS development.
# WebRTC and Web Crypto APIs require HTTPS on non-localhost origins.

set -euo pipefail

CERT_DIR="ssl/certs"
DAYS=365

mkdir -p "$CERT_DIR"

# Detect local IP for SAN (Subject Alternative Name)
LOCAL_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

echo "Generating self-signed certificates..."
echo "  Output: $CERT_DIR/"
echo "  Valid for: $DAYS days"
echo "  Local IP: ${LOCAL_IP:-none detected}"

# Build SAN extension
SAN="DNS:localhost,IP:127.0.0.1"
if [ -n "$LOCAL_IP" ]; then
    SAN="$SAN,IP:$LOCAL_IP"
fi

openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -days "$DAYS" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=$SAN" \
    2>/dev/null

echo "Done. Certificates created:"
echo "  $CERT_DIR/fullchain.pem"
echo "  $CERT_DIR/privkey.pem"
echo ""
echo "For cross-device testing, trust the cert on your device or use"
echo "your browser's certificate exception flow."
