import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("emergency.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE,
    name TEXT,
    sensitivity TEXT DEFAULT 'medium',
    github_id TEXT,
    github_username TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    phone TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    location TEXT,
    trigger_info TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Migrations for existing tables
try {
  db.prepare("ALTER TABLE alerts ADD COLUMN trigger_info TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE users ADD COLUMN sensitivity TEXT DEFAULT 'medium'").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE users ADD COLUMN github_id TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE users ADD COLUMN github_username TEXT").run();
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/auth/otp/send", (req, res) => {
    const { phone } = req.body;
    console.log(`Sending OTP to ${phone}`);
    // In a real app, use Twilio Verify or similar
    res.json({ success: true, message: "OTP sent (Mocked)" });
  });

  app.post("/api/auth/otp/verify", (req, res) => {
    const { phone, otp } = req.body;
    // Mock verification: any 6-digit OTP works
    if (otp.length === 6) {
      let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as any;
      if (!user) {
        const result = db.prepare("INSERT INTO users (phone) VALUES (?)").run(phone);
        user = { id: result.lastInsertRowid, phone };
      }
      res.json({ success: true, user });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  });

  app.get("/api/contacts/:userId", (req, res) => {
    const contacts = db.prepare("SELECT * FROM contacts WHERE user_id = ?").all(req.params.userId);
    res.json(contacts);
  });

  app.post("/api/contacts", (req, res) => {
    const { userId, name, phone } = req.body;
    db.prepare("INSERT INTO contacts (user_id, name, phone) VALUES (?, ?, ?)").run(userId, name, phone);
    res.json({ success: true });
  });

  app.delete("/api/contacts/:id", (req, res) => {
    db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post("/api/alerts", (req, res) => {
    const { userId, type, location, batteryLevel, triggerInfo } = req.body;
    db.prepare("INSERT INTO alerts (user_id, type, location, trigger_info) VALUES (?, ?, ?, ?)").run(userId, type, location, triggerInfo);
    
    // Fetch user and contacts
    const user = db.prepare("SELECT name, phone FROM users WHERE id = ?").get(userId) as any;
    const contacts = db.prepare("SELECT name, phone FROM contacts WHERE user_id = ?").all(userId) as any[];
    const userName = user?.name || "A Guardian user";
    const batteryInfo = batteryLevel ? ` (Battery: ${batteryLevel}%)` : "";
    
    // Enhanced SMS message
    const message = `EMERGENCY! ${userName} may have been in an accident. PLEASE CHECK THEIR LOCATION IMMEDIATELY: ${location}${batteryInfo}`;
    
    // Simulate SMS and Voice Call for each contact
    contacts.forEach(contact => {
      console.log(`[SMS] Sending to ${contact.name} (${contact.phone}): ${message}`);
      console.log(`[VOICE CALL] Initiating automated emergency call to ${contact.name} (${contact.phone})...`);
      console.log(`[VOICE CALL] Playing message: "This is an automated emergency alert from Guardian. Your contact ${userName} may have been in an accident. Please check your messages for their location."`);
    });
    
    res.json({ success: true });
  });

  app.post("/api/user/update", (req, res) => {
    const { userId, name, sensitivity } = req.body;
    db.prepare("UPDATE users SET name = ?, sensitivity = ? WHERE id = ?").run(name, sensitivity, userId);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    res.json({ success: true, user });
  });

  app.get("/api/alerts/:userId", (req, res) => {
    const alerts = db.prepare("SELECT * FROM alerts WHERE user_id = ? ORDER BY timestamp DESC").all(req.params.userId);
    res.json(alerts);
  });

  // GitHub OAuth Routes
  app.get('/api/auth/github/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'GitHub Client ID not configured' });
    }
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/github/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
    res.json({ url });
  });

  app.get('/auth/github/callback', async (req, res) => {
    const { code, state } = req.query;
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!code) return res.status(400).send('No code provided');

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code
        })
      });
      const tokenData = await tokenRes.json() as any;
      const accessToken = tokenData.access_token;

      if (!accessToken) throw new Error('Failed to get access token');

      // Get user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': 'Guardian-App'
        }
      });
      const githubUser = await userRes.json() as any;

      // We need to know which user to link this to. 
      // In a real app, we'd use a session or a state parameter.
      // For this demo, we'll use a cookie or just instruct the user.
      // Since we don't have a robust session system here, we'll use a temporary state if provided.
      const userId = state; 

      if (userId) {
        db.prepare("UPDATE users SET github_id = ?, github_username = ? WHERE id = ?").run(
          githubUser.id.toString(),
          githubUser.login,
          userId
        );
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>GitHub connected successfully! You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('GitHub OAuth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
