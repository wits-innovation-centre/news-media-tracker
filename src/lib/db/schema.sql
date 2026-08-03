-- schema.sql

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  schema_id TEXT,
  parent_id TEXT,
  title TEXT,
  frontmatter TEXT,
  body TEXT,
  created_by TEXT,
  updated_by TEXT,
  deleted_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS merge_queue (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  secondary_document_id TEXT,
  author_id TEXT NOT NULL,
  action TEXT NOT NULL,
  base_frontmatter TEXT,
  base_body TEXT,
  secondary_base_frontmatter TEXT,
  secondary_base_body TEXT,
  proposed_title TEXT,
  proposed_frontmatter TEXT,
  proposed_body TEXT,
  metadata TEXT,
  status TEXT NOT NULL,
  reviewed_by TEXT,
  review_comment TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS archival_records (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  archive_type TEXT NOT NULL, -- 'LOCAL_OPFS', 'WAYBACK_MACHINE', 'WEBTORRENT'
  sha256_hash TEXT NOT NULL,
  ipfs_cid TEXT,
  torrent_infohash TEXT,
  uri_or_path TEXT,
  file_size_bytes INTEGER,
  device_id TEXT NOT NULL,
  last_verified_at INTEGER,
  health_status TEXT DEFAULT 'UNCHECKED', -- 'HEALTHY', 'CORRUPTED', 'MISSING'
  blockchain_tx_hash TEXT,    -- Merkle Root Hash
  blockchain_network TEXT,    -- 'BITCOIN_OPENTIMESTAMPS'
  anchored_at TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0
);

-- Indexing for fast sync queries
CREATE INDEX IF NOT EXISTS idx_notes_sync ON notes(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_merge_queue_sync ON merge_queue(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_archival_records_sync ON archival_records(workspace_id, updated_at);

-- Index for OpenTimestamps Cron Worker batching
CREATE INDEX IF NOT EXISTS idx_pending_anchors ON archival_records (blockchain_tx_hash, health_status);