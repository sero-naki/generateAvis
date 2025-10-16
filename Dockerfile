# Image de base
FROM node:18-bullseye-slim

# Variables d'environnement
ENV PORT=8080
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /usr/src/app

# Installer dépendances système nécessaires pour Chromium / Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    wget \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# Copier package.json et package-lock.json (si présent) et installer les dépendances
COPY package*.json ./

# Installer les dépendances Node (prefère npm ci si package-lock présent, sinon fallback to npm install)
RUN npm ci --only=production || npm install --only=production


# Copier le code de l'application
COPY . .

# Donner la propriété au user node pour exécuter sans root
RUN chown -R node:node /usr/src/app

# Exposer le port et lancer en tant qu'utilisateur non-root
EXPOSE 8080
USER node

CMD ["node", "index.js"]
