#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
  echo 'Запустите этот файл на новом Ubuntu VPS через sudo bash deploy/install-docker.sh'
  exit 1
fi
. /etc/os-release
if [[ "$ID" != ubuntu ]]; then
  echo 'Скрипт подготовлен для Ubuntu. Для другой ОС используйте официальную инструкцию Docker.'
  exit 1
fi
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo 'Docker и Compose уже установлены.'
  exit 0
fi
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
gasu_arch="$(dpkg --print-architecture)"
gasu_codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $gasu_codename
Components: stable
Architectures: $gasu_arch
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
