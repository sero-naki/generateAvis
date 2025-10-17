# Image de base
FROM node:22-slim

ENV PORT=8080
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /usr/src/app

# Installer dépendances système nécessaires pour Chromium / Puppeteer et Chromium via apt
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
  chromium \
  && rm -rf /var/lib/apt/lists/*

# Copier package.json et package-lock.json et installer les dépendances

COPY package*.json ./

# Créer le répertoire de cache Puppeteer et donner la main à l'utilisateur node
RUN mkdir -p /home/node/.cache/puppeteer \
 && chown -R node:node /home/node/.cache

# Installer les dépendances Node (postinstall ne téléchargera pas Chromium grâce à PUPPETEER_SKIP_CHROMIUM_DOWNLOAD)
RUN npm ci --only=production --unsafe-perm=true || npm install --only=production --unsafe-perm=true

# Copier le code de l'application
COPY . .

# Donner la propriété au user node pour exécuter sans root et éviter problèmes de cache
RUN chown -R node:node /usr/src/app /home/node/.cache

# Exposer le port et lancer en tant qu'utilisateur non-root
EXPOSE 8080
USER node

CMD ["node", "index.js"]