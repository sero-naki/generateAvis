const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(express.json()); // Pour parser les requêtes JSON

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

    // Lancement du navigateur
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshot = await page.screenshot({ type: 'jpeg' });
    await browser.close();

    res.set('Content-Type', 'image/jpeg');
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
