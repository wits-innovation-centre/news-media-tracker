-- schema.sql

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_group_id TEXT,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL
);

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
  user_id TEXT,
  device_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS merge_queue (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  secondary_document_id TEXT,
  author_id TEXT NOT NULL,
  user_id TEXT,
  device_id TEXT,
  action TEXT NOT NULL,
  source_id TEXT,
  target_id TEXT,
  entity_type TEXT,
  similarity_score REAL,
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
  updated_at INTEGER NOT NULL,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS archival_records (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  archive_type TEXT NOT NULL, -- 'LOCAL_OPFS', 'WAYBACK_MACHINE', 'WEBTORRENT', 'REPORT_CONTENT'
  sha256_hash TEXT NOT NULL,
  ipfs_cid TEXT,
  torrent_infohash TEXT,
  uri_or_path TEXT,
  file_size_bytes INTEGER,
  device_id TEXT NOT NULL,
  last_verified_at INTEGER,
  health_status TEXT DEFAULT 'UNCHECKED', -- 'HEALTHY', 'CORRUPTED', 'MISSING'
  sync_status TEXT DEFAULT 'PENDING_ANCHOR', -- 'PENDING_ANCHOR', 'PENDING_CONFIRMATION', 'ANCHORED', 'ANCHOR_FAILED'
  blockchain_tx_hash TEXT,    -- Final Bitcoin transaction id after OTS upgrade/verification
  blockchain_network TEXT,    -- 'BITCOIN_OPENTIMESTAMPS'
  ots_proof_payload TEXT,     -- Base64 .ots proof payload
  anchored_at TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS schema_metadata (
  schema_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  metadata TEXT NOT NULL,
  PRIMARY KEY (schema_id, workspace_id)
);

-- Indexing for fast sync queries
CREATE INDEX IF NOT EXISTS idx_notes_sync ON notes(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_merge_queue_sync ON merge_queue(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_archival_records_sync ON archival_records(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_archival_records_wayback_sync ON archival_records(workspace_id, archive_type, sync_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_schema_metadata_workspace ON schema_metadata(workspace_id, schema_id);

-- Index for OpenTimestamps Cron Worker batching
CREATE INDEX IF NOT EXISTS idx_pending_anchors ON archival_records (blockchain_tx_hash, health_status);