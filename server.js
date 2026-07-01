require('dotenv').config();
const docDB = require('./db');
const { embedText, chunkText, cosineSimilarity, getEmbedder } = require('./embeddings');
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const Tesseract = require('tesseract.js');
const PptxParser = require('node-pptx-parser').default;
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();

// Initialize database
// Create uploads folder if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
  console.log('✅ uploads folder created');
}

docDB.initDB().catch(function(err) {
  console.error('❌ Database initialization failed:', err);
  process.exit(1);
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.set('trust proxy', 1);
app.use(express.json());

getEmbedder();

app.use(session({
  store: new pgSession({
    pool: sessionPool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
  maxAge: 24 * 60 * 60 * 1000,
  secure: true,
  sameSite: 'none',
  httpOnly: true
}
}));

app.use(passport.initialize());
app.use(passport.session());

const users = {};

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || '/auth/google/callback'
}, function(accessToken, refreshToken, profile, done) {
  const user = {
    id: profile.id,
    name: profile.displayName,
    email: profile.emails[0].value,
    photo: profile.photos[0].value
  };
  users[profile.id] = user;
  return done(null, user);
}));

passport.serializeUser(function(user, done) { done(null, user.id); });
passport.deserializeUser(function(id, done) { done(null, users[id] || null); });

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/welcome.html');
}

// ═══════════════════════════════════════
// RATE LIMITERS
// ═══════════════════════════════════════

function getKey(req) {
  return req.user ? req.user.id : ipKeyGenerator(req);
}

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: getKey,
  skip: function(req) {
    const userKey = req.body ? req.body.groqKey : null;
    return !!(userKey && userKey.trim());
  },
  handler: function(req, res) {
    res.json({
      reply: '⏳ **You have reached the free demo limit of 30 messages per hour.**\n\nTo continue chatting without any limits, you can add your own **free** Groq API key in just 30 seconds:\n\n**Step 1** — Get your free API key:\n👉 https://console.groq.com/keys\n*(Sign up or log in → click "Create API Key" → copy it)*\n\n**Step 2** — Add it to DocuMind AI:\n1. Click the **⚙️ gear icon** at the bottom-left of the sidebar\n2. Paste your key in the **"Groq API Key"** field\n3. Click **"Save Changes"**\n\nYou will then have unlimited access with your own key. 🚀',
      suggestions: [],
      searchedDocs: [],
      rateLimited: true
    });
  }
});

const uploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  keyGenerator: getKey,
  handler: function(req, res) {
    res.status(429).json({
      success: false,
      message: '⏳ You have reached the demo upload limit of 50 files per day.\n\nTo remove this limit, add your own free Groq API key in Settings ⚙️.\n\nGet one free at https://console.groq.com',
      rateLimited: true
    });
  }
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: getKey
});

app.use('/api', globalLimiter);

// ═══════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════
// Keep-alive ping endpoint
app.get('/ping', function(req, res) {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/welcome.html' }),
  function(req, res) {
    req.session.save(function(err) {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect('/welcome.html');
      }
      console.log('✅ Session saved, redirecting to /');
      res.redirect('/');
    });
  }
);
app.get('/auth/logout', function(req, res) {
  req.logout(function() { res.redirect('/welcome.html'); });
});

app.get('/auth/user', function(req, res) {
  if (req.isAuthenticated()) {
    res.json({ loggedIn: true, user: req.user });
  } else {
    res.json({ loggedIn: false });
  }
});

app.get('/login.html', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/welcome.html', function(req, res) {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

app.get('/', function(req, res) {
  console.log('/ route hit');
  console.log('isAuthenticated:', req.isAuthenticated());
  console.log('Session ID:', req.sessionID);
  console.log('User:', req.user);
  if (!req.isAuthenticated()) {
    return res.redirect('/welcome.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════
// CHAT HISTORY (in-memory per session)
// ═══════════════════════════════════════

const userHistory = {};

function getUserHistory(userId) {
  if (!userHistory[userId]) userHistory[userId] = [];
  return userHistory[userId];
}

// ═══════════════════════════════════════
// MULTER SETUP
// ═══════════════════════════════════════

const storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, 'uploads/'); },
  filename: function(req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});

const upload = multer({
  storage: storage,
  limits: { files: 200, fileSize: 50 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.pdf','.docx','.xlsx','.xls','.csv','.pptx','.txt','.md','.png','.jpg','.jpeg','.webp'];
    if (allowed.indexOf(ext) !== -1) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported: ' + ext));
    }
  }
});

// ═══════════════════════════════════════
// FILE TYPE EXTRACTORS
// ═══════════════════════════════════════

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return { text: data.text, pages: data.numpages };
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return { text: result.value, pages: Math.ceil(result.value.length / 3000) };
  }

  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    const workbook = XLSX.readFile(filePath);
    let text = '';
    workbook.SheetNames.forEach(function(sheetName) {
      const sheet = workbook.Sheets[sheetName];
      text += '\n--- Sheet: ' + sheetName + ' ---\n' + XLSX.utils.sheet_to_csv(sheet) + '\n';
    });
    return { text: text, pages: workbook.SheetNames.length };
  }

  if (ext === '.pptx') {
    const parser = new PptxParser(filePath);
    const slides = await parser.extractText();
    let text = '';
    slides.forEach(function(slide, i) {
      text += '\n--- Slide ' + (i + 1) + ' ---\n' + (slide.text || slide.join(' ')) + '\n';
    });
    return { text: text, pages: slides.length };
  }

  if (ext === '.txt' || ext === '.md') {
    const text = fs.readFileSync(filePath, 'utf-8');
    return { text: text, pages: Math.ceil(text.length / 3000) };
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].indexOf(ext) !== -1) {
    const result = await Tesseract.recognize(filePath, 'eng');
    return { text: result.data.text, pages: 1 };
  }

  throw new Error('Unsupported file type: ' + ext);
}

// ═══════════════════════════════════════
// UPLOAD ROUTE
// ═══════════════════════════════════════

app.post('/upload', isLoggedIn, uploadLimiter, upload.array('pdf', 200), async function(req, res) {
  try {
    const userId = req.user.id;
    const results = [];
    const errors = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        const filePath = path.join(__dirname, file.path);
        const extracted = await extractText(filePath, file.originalname);
        const text = extracted.text;
        const pages = extracted.pages;

        if (text && text.trim().length > 0) {
          const exists = await docDB.documentExists(userId, file.originalname);
          if (!exists) {
            const docId = await docDB.addDocument(userId, {
              name: file.originalname,
              content: text,
              pages: pages || 1,
              size: Math.round(file.size / 1024) + ' KB',
              type: path.extname(file.originalname).toLowerCase().replace('.', '')
            });

            // Only generate embeddings in development — too slow on free hosting
if (process.env.NODE_ENV !== 'production') {
  const pieces = chunkText(text);
  for (let j = 0; j < pieces.length; j++) {
    const vector = await embedText(pieces[j]);
    await docDB.addChunk(docId, userId, file.originalname, pieces[j], vector);
  }
} else {
  // In production use keyword-based chunking (much faster)
  const pieces = chunkText(text);
  for (let j = 0; j < pieces.length; j++) {
    // Store with empty embedding — search will use keyword fallback
    await docDB.addChunk(docId, userId, file.originalname, pieces[j], []);
  }
}

            results.push(file.originalname);
          } else {
            errors.push(file.originalname + ' already loaded');
          }
        } else {
          errors.push(file.originalname + ' appears empty');
        }

        fs.unlink(filePath, function() {});
      } catch (e) {
        console.error('Failed to process ' + file.originalname + ':', e.message);
        errors.push(file.originalname + ' failed to read');
      }
    }

    userHistory[userId] = [];
    const total = await docDB.countUserDocs(userId);

    res.json({
      success: true,
      loaded: results,
      errors: errors,
      total: total,
      message: results.length + ' file(s) loaded!'
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, message: 'Upload failed.' });
  }
});

// ═══════════════════════════════════════
// DOCUMENTS ROUTE
// ═══════════════════════════════════════

app.get('/documents', isLoggedIn, async function(req, res) {
  const docs = await docDB.getUserDocs(req.user.id);
  res.json({
    documents: docs.map(function(d) {
      return { name: d.name, pages: d.pages, size: d.size, type: d.type };
    }),
    total: docs.length
  });
});

app.post('/remove', isLoggedIn, async function(req, res) {
  await docDB.removeDocument(req.user.id, req.body.name);
  userHistory[req.user.id] = [];
  const total = await docDB.countUserDocs(req.user.id);
  res.json({ success: true, total: total });
});

// ═══════════════════════════════════════
// SEARCH ROUTE
// ═══════════════════════════════════════

app.post('/search', isLoggedIn, async function(req, res) {
  const query = req.body.query;
  const docs = await docDB.getUserDocs(req.user.id);
  if (!query || docs.length === 0) return res.json({ results: [] });

  const results = [];
  const queryLower = query.toLowerCase();

  docs.forEach(function(doc) {
    doc.content.split('\n').forEach(function(line) {
      if (line.toLowerCase().indexOf(queryLower) !== -1 && line.trim().length > 20) {
        results.push({ doc: doc.name, line: line.trim().slice(0, 200) });
      }
    });
  });

  res.json({ results: results.slice(0, 20) });
});

// ═══════════════════════════════════════
// CHAT ROUTE
// ═══════════════════════════════════════

app.post('/chat', isLoggedIn, chatLimiter, async function(req, res) {
  const message = req.body.message;
  const groqKey = req.body.groqKey;
  const regenerate = req.body.regenerate;
  const userId = req.user.id;
  const docs = await docDB.getUserDocs(userId);
  const history = getUserHistory(userId);

  if (docs.length === 0) {
    return res.json({ reply: '⚠️ Please upload at least one file first!' });
  }

  const apiKey = (groqKey && groqKey.trim()) ? groqKey.trim() : process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.json({ reply: '⚠️ No Groq API key configured. Please add one in Settings ⚙️' });
  }

  if (regenerate && history.length >= 2) {
    userHistory[userId] = history.slice(0, -2);
  }

  const relevantChunks = await findRelevantChunks(message, userId);
  let context = '';
  const sourcesUsed = new Set();

  relevantChunks.forEach(function(chunk) {
    context += '\n\n--- From "' + chunk.docName + '" ---\n' + chunk.text;
    sourcesUsed.add(chunk.docName);
  });

  getUserHistory(userId).push({ role: 'user', content: message });

  const docList = docs.map(function(d, i) {
    return (i + 1) + '. "' + d.name + '" (' + d.pages + ' pages/sections)';
  }).join('\n');

  const messages = [
    {
      role: 'system',
      content: 'You are DocuMind AI, a professional document assistant for ' + req.user.name + '.\n' +
        'You have access to ' + docs.length + ' uploaded document(s):\n' + docList + '\n\n' +
        'MOST RELEVANT CONTENT FOR THIS QUESTION (retrieved via semantic search):\n' +
        (context || 'No closely matching content found.') + '\n\n' +
        'INSTRUCTIONS:\n' +
        '- Always cite which document your answer comes from using [Source: filename] format\n' +
        '- If the answer is not found in any document, clearly say so\n' +
        '- At the end, suggest 2-3 follow-up questions prefixed with "SUGGESTED:"\n' +
        '- Be accurate, concise and professional'
    }
  ].concat(getUserHistory(userId).slice(-10));

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    if (data.error) {
      return res.json({ reply: '❌ Groq Error: ' + data.error.message });
    }

    const fullReply = data.choices[0].message.content;
    const suggestedMatch = fullReply.match(/SUGGESTED:([\s\S]*?)$/);
    const suggestions = suggestedMatch
      ? suggestedMatch[1].trim().split('\n')
          .map(function(s) { return s.replace(/^[-•\d.]\s*/, '').trim(); })
          .filter(Boolean).slice(0, 3)
      : [];
    const reply = fullReply.replace(/SUGGESTED:[\s\S]*?$/, '').trim();

    getUserHistory(userId).push({ role: 'assistant', content: reply });
    res.json({ reply: reply, suggestions: suggestions, searchedDocs: Array.from(sourcesUsed) });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ reply: '❌ Something went wrong. Please try again.' });
  }
});

async function findRelevantChunks(query, userId, topN) {
  if (!topN) topN = 6;
  const allChunks = await docDB.getUserChunks(userId);
  if (allChunks.length === 0) return [];

  // Check if embeddings exist
  const hasEmbeddings = allChunks[0].embedding && allChunks[0].embedding.length > 0;

  if (hasEmbeddings) {
    // Semantic search
    const queryVector = await embedText(query);
    const scored = allChunks.map(function(chunk) {
      return {
        docName: chunk.docName,
        text: chunk.text,
        score: cosineSimilarity(queryVector, chunk.embedding)
      };
    });
    return scored
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, topN)
      .filter(function(c) { return c.score > 0.2; });
  } else {
    // Keyword search fallback
    const queryWords = query.toLowerCase().split(' ')
      .filter(function(w) { return w.length > 2; });

    const scored = allChunks.map(function(chunk) {
      const textLower = chunk.text.toLowerCase();
      let score = 0;
      queryWords.forEach(function(word) {
        const matches = textLower.split(word).length - 1;
        score += matches;
      });
      return { docName: chunk.docName, text: chunk.text, score: score };
    });

    return scored
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, topN)
      .filter(function(c) { return c.score > 0; });
  }
}

// ═══════════════════════════════════════
// CLEAR ROUTES
// ═══════════════════════════════════════

app.post('/clear', isLoggedIn, function(req, res) {
  userHistory[req.user.id] = [];
  res.json({ success: true });
});

app.post('/clearall', isLoggedIn, async function(req, res) {
  await docDB.clearAllDocuments(req.user.id);
  userHistory[req.user.id] = [];
  res.json({ success: true });
});

// ═══════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('✅ DocuMind AI running at http://localhost:' + PORT);
  console.log('🔑 Groq key loaded: ' + (process.env.GROQ_API_KEY ? 'YES ✅' : 'NO ❌'));
  console.log('🗄️ Database: PostgreSQL (Supabase)');

  // Keep-alive ping — prevents Render free tier from sleeping
  if (process.env.NODE_ENV === 'production' && process.env.RENDER_URL) {
    const keepAliveInterval = 14 * 60 * 1000; // 14 minutes
    setInterval(function() {
      fetch(process.env.RENDER_URL + '/ping')
        .then(function() { console.log('🏓 Keep-alive ping sent'); })
        .catch(function(err) { console.log('⚠️ Keep-alive ping failed:', err.message); });
    }, keepAliveInterval);
    console.log('🏓 Keep-alive enabled — pinging every 14 minutes');
  }
});