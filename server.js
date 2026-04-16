const http = require("http");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const YOUR_EMAIL = "manan.kachhwaha@nexuscomchem.com";
const PORT = process.env.PORT;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Extract base64 images from HTML and replace with cid references
function processHtmlImages(html) {
  const attachments = [];
  let cidIndex = 0;
  const processed = html.replace(/src="data:([^;]+);base64,([^"]+)"/g, (match, mimeType, b64) => {
    const cid = `img_${cidIndex++}@ncc`;
    attachments.push({
      filename: `image${cidIndex}.png`,
      content: Buffer.from(b64, 'base64'),
      cid: cid,
      contentType: mimeType
    });
    return `src="cid:${cid}"`;
  });
  return { processed, attachments };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("index.html not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      try {
        const { appPassword, contacts, subject, emailHtml, emailText, ccEmail, fromName } = JSON.parse(body);

        if (!appPassword || !contacts || !subject || !emailHtml) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields" }));
          return;
        }

        const transporter = nodemailer.createTransport({
          host: "smtp.zoho.in",
          port: 465,
          secure: true,
          auth: { user: YOUR_EMAIL, pass: appPassword },
        });

        const results = [];

        for (const { name, email } of contacts) {
          // Replace {{name}} in both subject, html, and text
          const personalSubject = subject.replace(/\{\{name\}\}/gi, name);
          const personalHtml = emailHtml.replace(/\{\{name\}\}/gi, name);
          const personalText = (emailText || '').replace(/\{\{name\}\}/gi, name);

          // Wrap in full HTML document with clean styling
          const fullHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; margin: 0; padding: 0; }
  div { max-width: 620px; padding: 24px; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body><div>${personalHtml}</div></body>
</html>`;

          // Extract inline base64 images and convert to CID attachments
          const { processed, attachments } = processHtmlImages(fullHtml);

          const mailOptions = {
            from: `${fromName || 'Manan Kachhwaha'} <${YOUR_EMAIL}>`,
            to: email,
            subject: personalSubject,
            text: personalText,
            html: processed,
            attachments: attachments
          };

          if (ccEmail && ccEmail.trim()) mailOptions.cc = ccEmail.trim();

          try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Sent to ${name} <${email}>${ccEmail ? ' | CC: ' + ccEmail : ''}`);
            results.push({ name, email, status: "sent" });
          } catch (err) {
            console.log(`❌ Failed: ${name} <${email}> — ${err.message}`);
            results.push({ name, email, status: "failed", error: err.message });
          }
          await sleep(2000);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 NCC Mail Merge ready — open http://localhost:3000 in your browser\n`);
});
