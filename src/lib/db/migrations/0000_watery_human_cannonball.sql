CREATE TABLE `archival_records` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`archive_type` text NOT NULL,
	`sha256_hash` text NOT NULL,
	`ipfs_cid` text,
	`torrent_infohash` text,
	`uri_or_path` text,
	`file_size_bytes` integer,
	`device_id` text NOT NULL,
	`last_verified_at` integer,
	`health_status` text DEFAULT 'UNCHECKED',
	`sync_status` text DEFAULT 'PENDING_ANCHOR',
	`blockchain_tx_hash` text,
	`blockchain_network` text,
	`ots_proof_payload` text,
	`anchored_at` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`is_deleted` integer DEFAULT 0,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_archival_records_sync` ON `archival_records` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_archival_records_wayback_sync` ON `archival_records` (`workspace_id`,`archive_type`,`sync_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pending_anchors` ON `archival_records` (`blockchain_tx_hash`,`health_status`);--> statement-breakpoint
CREATE TABLE `merge_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`document_id` text NOT NULL,
	`secondary_document_id` text,
	`author_id` text NOT NULL,
	`user_id` text,
	`device_id` text,
	`action` text NOT NULL,
	`source_id` text,
	`target_id` text,
	`entity_type` text,
	`similarity_score` real,
	`base_frontmatter` text,
	`base_body` text,
	`secondary_base_frontmatter` text,
	`secondary_base_body` text,
	`proposed_title` text NOT NULL,
	`proposed_frontmatter` text NOT NULL,
	`proposed_body` text NOT NULL,
	`metadata` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`review_comment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_merge_queue_sync` ON `merge_queue` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`schema_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`frontmatter` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`deleted_by` text,
	`user_id` text,
	`device_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`is_deleted` integer DEFAULT 0 NOT NULL,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_notes_sync` ON `notes` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `schema_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`updated_at` integer,
	`is_deleted` integer DEFAULT 0,
	`synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `schema_metadata` (
	`schema_id` text NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`metadata` text NOT NULL,
	PRIMARY KEY(`schema_id`, `workspace_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_schema_metadata_workspace` ON `schema_metadata` (`workspace_id`,`schema_id`);--> statement-breakpoint
CREATE TABLE `schemas` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'custom',
	`parentSchemaId` text,
	`groupId` text,
	`groupName` text,
	`subtypeFields` text,
	`fields` text NOT NULL,
	`updated_at` integer,
	`is_deleted` integer DEFAULT 0,
	`synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `specification_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`updated_at` integer,
	`is_deleted` integer DEFAULT 0,
	`synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `specifications` (
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`updated_at` integer,
	`is_deleted` integer DEFAULT 0,
	`synced_at` integer,
	PRIMARY KEY(`workspace_id`, `kind`, `value`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon_path` text,
	`template_group_id` text,
	`created_at` integer NOT NULL,
	`last_accessed_at` integer NOT NULL
);
