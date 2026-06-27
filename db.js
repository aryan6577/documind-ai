const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create tables if they don't exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      pages INTEGER,
      size TEXT,
      type TEXT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

    CREATE TABLE IF NOT EXISTS chunks (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      doc_name TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_user ON chunks(user_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
  `);
  console.log('✅ Database tables ready');
}

// ═══════════════════════════════════════
// DOCUMENT FUNCTIONS
// ═══════════════════════════════════════

async function getUserDocs(userId) {
  const result = await pool.query(
    'SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return result.rows;
}

async function addDocument(userId, doc) {
  const result = await pool.query(
    `INSERT INTO documents (user_id, name, content, pages, size, type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, doc.name, doc.content, doc.pages, doc.size, doc.type]
  );
  return result.rows[0].id;
}

async function documentExists(userId, name) {
  const result = await pool.query(
    'SELECT id FROM documents WHERE user_id = $1 AND name = $2',
    [userId, name]
  );
  return result.rows.length > 0;
}

async function removeDocument(userId, name) {
  const doc = await pool.query(
    'SELECT id FROM documents WHERE user_id = $1 AND name = $2',
    [userId, name]
  );
  if (doc.rows.length > 0) {
    await pool.query('DELETE FROM chunks WHERE document_id = $1', [doc.rows[0].id]);
  }
  await pool.query(
    'DELETE FROM documents WHERE user_id = $1 AND name = $2',
    [userId, name]
  );
}

async function clearAllDocuments(userId) {
  await pool.query('DELETE FROM chunks WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM documents WHERE user_id = $1', [userId]);
}

async function countUserDocs(userId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM documents WHERE user_id = $1',
    [userId]
  );
  return parseInt(result.rows[0].count);
}

// ═══════════════════════════════════════
// CHUNK / EMBEDDING FUNCTIONS
// ═══════════════════════════════════════

async function addChunk(documentId, userId, docName, chunkText, embedding) {
  await pool.query(
    `INSERT INTO chunks (document_id, user_id, doc_name, chunk_text, embedding)
     VALUES ($1, $2, $3, $4, $5)`,
    [documentId, userId, docName, chunkText, JSON.stringify(embedding)]
  );
}

async function getUserChunks(userId) {
  const result = await pool.query(
    'SELECT doc_name, chunk_text, embedding FROM chunks WHERE user_id = $1',
    [userId]
  );
  return result.rows.map(r => ({
    docName: r.doc_name,
    text: r.chunk_text,
    embedding: JSON.parse(r.embedding)
  }));
}

module.exports = {
  initDB,
  getUserDocs,
  addDocument,
  documentExists,
  removeDocument,
  clearAllDocuments,
  countUserDocs,
  addChunk,
  getUserChunks
};