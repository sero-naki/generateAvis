const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(express.json()); // Pour parser les requêtes JSON


app.get('/health', (req, res) => {
  res.send('Serveur en cours d\'exécution. Utilisez le endpoint /generateAvis pour générer une image.');
});

app.post('/generateAvis', async (req, res) => {
  try {
    const { prenom, nom, age, lieu, description, contact, photo_url } = req.body;

    // Lecture du template HTML
    const templatePath = path.join(__dirname, 'template.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    html = html
      .replace('{{prenom}}', prenom || '')
      .replace('{{nom}}', nom || '')
      .replace('{{age}}', age || '')
      .replace('{{lieu}}', lieu || '')
      .replace('{{description}}', description || '')
      .replace('{{contact}}', contact || '')
      .replace('{{photo_url}}', photo_url || '');

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
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PNG (better compatibility) and close browser
    const screenshot = await page.screenshot({ type: 'png' });
    await browser.close();

    // Diagnostic: log magic bytes and size to help debug format issues
    try {
      const magic = screenshot.slice(0, 8).toString('hex');
      console.log('Screenshot size:', screenshot.length, 'bytes, magic:', magic);
    } catch (e) {
      console.warn('Could not log screenshot diagnostics:', e.message);
    }

    // Send as PNG and suggest filename
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="avis.png"');
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
