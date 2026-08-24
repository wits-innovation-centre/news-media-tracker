import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type { MergeProposal, ArchivalLedgerRecord } from '../types';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  iconPath: text('icon_path'),
  templateGroupId: text('template_group_id'),
  createdAt: integer('created_at').notNull(),
  lastAccessedAt: integer('last_accessed_at').notNull(),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').default('default').notNull(),
  schemaId: text('schema_id').notNull(),
  parentId: text('parent_id'),
  title: text('title').notNull(),
  frontmatter: text('frontmatter').notNull(), // JSON string
  body: text('body').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  deletedBy: text('deleted_by'),
  userId: text('user_id'),
  deviceId: text('device_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  isDeleted: integer('is_deleted').default(0).notNull(),
  syncedAt: integer('synced_at'),
}, (table) => [
  index('idx_notes_sync').on(table.workspaceId, table.updatedAt),
]);

export const schemas = sqliteTable('schemas', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').default('default').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  kind: text('kind').default('custom'),
  parentSchemaId: text('parentSchemaId'),
  groupId: text('groupId'),
  groupName: text('groupName'),
  subtypeFields: text('subtypeFields'), // JSON string
  fields: text('fields').notNull(), // JSON string
  updatedAt: integer('updated_at'),
  isDeleted: integer('is_deleted').default(0),
  syncedAt: integer('synced_at'),
});

export const schemaGroups = sqliteTable('schema_groups', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').default('default').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  updatedAt: integer('updated_at'),
  isDeleted: integer('is_deleted').default(0),
  syncedAt: integer('synced_at'),
});

export const schemaMetadata = sqliteTable('schema_metadata', {
  schemaId: text('schema_id').notNull(),
  workspaceId: text('workspace_id').default('default').notNull(),
  metadata: text('metadata').notNull(),
}, (table) => [
  primaryKey({ columns: [table.schemaId, table.workspaceId] }),
  index('idx_schema_metadata_workspace').on(table.workspaceId, table.schemaId),
]);

export const specifications = sqliteTable('specifications', {
  kind: text('kind').notNull(),
  value: text('value').notNull(),
  workspaceId: text('workspace_id').default('default').notNull(),
  updatedAt: integer('updated_at'),
  isDeleted: integer('is_deleted').default(0),
  syncedAt: integer('synced_at'),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.kind, table.value] }),
]);

export const specificationRegistry = sqliteTable('specification_registry', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').default('default').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  updatedAt: integer('updated_at'),
  isDeleted: integer('is_deleted').default(0),
  syncedAt: integer('synced_at'),
});

export const mergeQueue = sqliteTable('merge_queue', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').default('default').notNull(),
  documentId: text('document_id').notNull(),
  secondaryDocumentId: text('secondary_document_id'),
  authorId: text('author_id').notNull(),
  userId: text('user_id'),
  deviceId: text('device_id'),
  action: text('action').$type<MergeProposal['action']>().notNull(),
  sourceId: text('source_id'),
  targetId: text('target_id'),
  entityType: text('entity_type'),
  similarityScore: real('similarity_score'),
  baseFrontmatter: text('base_frontmatter'),
  baseBody: text('base_body'),
  secondaryBaseFrontmatter: text('secondary_base_frontmatter'),
  secondaryBaseBody: text('secondary_base_body'),
  proposedTitle: text('proposed_title').notNull(),
  proposedFrontmatter: text('proposed_frontmatter').notNull(),
  proposedBody: text('proposed_body').notNull(),
  metadata: text('metadata'),
  status: text('status').$type<MergeProposal['status']>().default('pending').notNull(),
  reviewedBy: text('reviewed_by'),
  reviewComment: text('review_comment'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  syncedAt: integer('synced_at'),
}, (table) => [
  index('idx_merge_queue_sync').on(table.workspaceId, table.updatedAt),
]);

export const archivalRecords = sqliteTable('archival_records', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull(),
  workspaceId: text('workspace_id').default('default').notNull(),
  archiveType: text('archive_type').notNull(),
  sha256Hash: text('sha256_hash').notNull(),
  ipfsCid: text('ipfs_cid'),
  torrentInfohash: text('torrent_infohash'),
  uriOrPath: text('uri_or_path'),
  fileSizeBytes: integer('file_size_bytes'),
  deviceId: text('device_id').notNull(),
  lastVerifiedAt: integer('last_verified_at'),
  healthStatus: text('health_status').$type<ArchivalLedgerRecord['health_status']>().default('UNCHECKED'),
  syncStatus: text('sync_status').$type<ArchivalLedgerRecord['sync_status']>().default('PENDING_ANCHOR'),
  blockchainTxHash: text('blockchain_tx_hash'),
  blockchainNetwork: text('blockchain_network'),
  otsProofPayload: text('ots_proof_payload'),
  anchoredAt: text('anchored_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  isDeleted: integer('is_deleted').default(0),
  syncedAt: integer('synced_at'),
}, (table) => [
  index('idx_archival_records_sync').on(table.workspaceId, table.updatedAt),
  index('idx_archival_records_wayback_sync').on(table.workspaceId, table.archiveType, table.syncStatus, table.updatedAt),
  index('idx_pending_anchors').on(table.blockchainTxHash, table.healthStatus),
]);