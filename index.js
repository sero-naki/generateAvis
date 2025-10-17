const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(express.json()); // Pour parser les requêtes JSON

const https = require('https');
const http = require('http');

// helper: extract candidate image URL from HTML (og:image, twitter:image, link rel, first <img>)
function extractImageUrlFromHtml(baseUrl, html) {
  if (!html) return null;
  // try og:image
  let m = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (m && m[1]) return new URL(m[1], baseUrl).href;
  // twitter:image
  m = html.match(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  if (m && m[1]) return new URL(m[1], baseUrl).href;
  // link rel image_src
  m = html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
  if (m && m[1]) return new URL(m[1], baseUrl).href;
  // first image with jpg/png in src
  m = html.match(/<img[^>]+src=["']([^"']+\.(?:png|jpe?g|webp|gif))["'][^>]*>/i);
  if (m && m[1]) return new URL(m[1], baseUrl).href;
  // fallback: first <img src=
  m = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (m && m[1]) return new URL(m[1], baseUrl).href;
  return null;
}

// helper: fetch image (or page then extract image) and return data:<mime>;base64,... or null on failure
async function fetchAndEmbed(url, _depth = 0) {
  if (!url) return null;
  if (_depth > 1) return null; // avoid deep recursion
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const options = {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };
      console.log('fetchAndEmbed: requesting', url);
      client.get(url, options, (resp) => {
        console.log('fetchAndEmbed: response', url, 'status', resp.statusCode);
        const contentType = (resp.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        console.log('fetchAndEmbed: content-type', contentType);
        const chunks = [];
        resp.on('data', (c) => chunks.push(c));
        resp.on('end', async () => {
          try {
            const buf = Buffer.concat(chunks);
            if (contentType.startsWith('image/')) {
              const data = 'data:' + contentType + ';base64,' + buf.toString('base64');
              console.log('fetchAndEmbed: embedded image from', url);
              return resolve(data);
            }
            // if HTML, try to extract an image URL and fetch that
            if (contentType === 'text/html') {
              const html = buf.toString('utf8');
              const candidate = extractImageUrlFromHtml(url, html);
              console.log('fetchAndEmbed: extracted candidate from HTML:', candidate);
              if (candidate) {
                const embedded = await fetchAndEmbed(candidate, _depth + 1);
                if (embedded) console.log('fetchAndEmbed: embedded from candidate', candidate);
                return resolve(embedded);
              }
            }
            console.log('fetchAndEmbed: not an image and no candidate for', url);
            return resolve(null);
          } catch (e) {
            console.log('fetchAndEmbed: error processing', url, e && e.message);
            return resolve(null);
          }
        });
      }).on('error', (err) => { console.log('fetchAndEmbed: request error', url, err && err.message); resolve(null); }).on('timeout', function() { console.log('fetchAndEmbed: timeout', url); this.destroy(); resolve(null); });
    } catch (e) { resolve(null); }
  });
}


app.get('/health', (req, res) => {
  res.send('Serveur en cours d\'exécution. Utilisez le endpoint /generateAvis pour générer une image.');
});

app.post('/generateAvis', async (req, res) => {
  try {
    const { prenom, nom, age, lieu, description, contact, photo_url } = req.body;

    // Log the incoming body to help debug missing fields
    console.log('generateAvis body:', req.body);

    // Lecture du template HTML

    const templatePath = path.join(__dirname, 'templates.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Try to fetch the photo (or extract it from a page) and embed it as data URL to avoid external loading issues
    let embeddedPhoto = null;
    try {
      embeddedPhoto = await fetchAndEmbed(photo_url);
    } catch (e) {
      embeddedPhoto = null;
    }

    const photoValue = embeddedPhoto || photo_url || '';

    // Robust replacements: allow spaces inside braces and multiple occurrences
    html = html
      .replace(/{{\s*prenom\s*}}/g, prenom || '')
      .replace(/{{\s*nom\s*}}/g, nom || '')
      .replace(/{{\s*age\s*}}/g, age || '')
      .replace(/{{\s*lieu\s*}}/g, lieu || '')
      .replace(/{{\s*description\s*}}/g, description || '')
      .replace(/{{\s*contact\s*}}/g, contact || '')
      .replace(/{{\s*photo_url\s*}}/g, photoValue);

    // Lancement du navigateur — essaye d'abord @sparticuz/chromium puis fallback vers le binaire système
    let chromiumPath = null;
    try {
      // Si @sparticuz/chromium a téléchargé un binaire, récupère son chemin
      chromiumPath = await chromium.executablePath();
    } catch (e) {
      // fallback : chemins usuels pour chromium/chromium-browser
      if (fs.existsSync('/usr/bin/chromium')) chromiumPath = '/usr/bin/chromium';
      else if (fs.existsSync('/usr/bin/chromium-browser')) chromiumPath = '/usr/bin/chromium-browser';
      else chromiumPath = null;
    }
    console.log('Using Chromium executable at:', chromiumPath || 'default puppeteer resolution');

    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', ...(chromium.args || [])];
    const browser = await puppeteer.launch({
      args: launchArgs,
      defaultViewport: chromium.defaultViewport || null,
      executablePath: chromiumPath || undefined,
      headless: true
    });

  const page = await browser.newPage();
  // Set viewport to poster size (1200x1800)
  await page.setViewport({ width: 1200, height: 1800, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  // wait a tick for fonts to load/render
  await page.evaluateHandle('document.fonts.ready');

  // Generate PNG of the poster area
  const screenshot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 1800 } });
    await browser.close();

    // Diagnostic: log magic bytes and size to help debug format issues
    try {
      const magic = screenshot.slice(0, 8).toString('hex');
      console.log('Screenshot size:', screenshot.length, 'bytes, magic:', magic);
    } catch (e) {
      console.warn('Could not log screenshot diagnostics:', e.message);
    }

    // Atomically persist the screenshot inside the app directory to avoid readers
    try {
      const tmpPath = path.join(__dirname, `last_screenshot.png.tmp-${Date.now()}`);
      const finalPath = path.join(__dirname, 'last_screenshot.png');
      fs.writeFileSync(tmpPath, screenshot);
      fs.renameSync(tmpPath, finalPath);
      console.log('Atomically wrote debug screenshot to', finalPath);
    } catch (e) {
      console.warn('Could not write debug screenshot atomically:', e.message);
    }

    // Send as PNG and suggest filename (set explicit Content-Length to help clients)
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="avis.png"');
    res.set('Content-Length', String(screenshot.length));
    res.send(screenshot);

  } catch (err) {
    console.error('Erreur dans generateAvis:', err);
    res.status(500).json({ error: true, message: err.message });
  }
});

// Écoute sur le port 8080
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur démarré sur le port ${port}`);
});
