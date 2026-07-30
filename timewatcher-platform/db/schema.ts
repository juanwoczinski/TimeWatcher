import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const audit = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(),
  status: text("status", { enum: ["active", "suspended"] }).notNull(),
  timezone: text("timezone").notNull(), screenshotRetentionDays: integer("screenshot_retention_days").notNull(), ...audit,
}, (t) => [uniqueIndex("tenants_slug_uq").on(t.slug)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull(), name: text("name").notNull(),
  platformRole: text("platform_role", { enum: ["platform_admin", "user"] }).notNull(), ...audit,
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["tenant_admin", "manager", "collaborator", "auditor"] }).notNull(),
  teamId: text("team_id"), status: text("status", { enum: ["invited", "active", "disabled"] }).notNull(), ...audit,
}, (t) => [uniqueIndex("membership_tenant_user_uq").on(t.tenantId, t.userId), index("membership_tenant_idx").on(t.tenantId)]);

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  assignedUserId: text("assigned_user_id").references(() => users.id), hostname: text("hostname").notNull(),
  os: text("os", { enum: ["macos", "windows", "linux"] }).notNull(), agentVersion: text("agent_version").notNull(),
  status: text("status", { enum: ["online", "offline", "attention", "revoked"] }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }), policyId: text("policy_id"), ...audit,
}, (t) => [index("devices_tenant_idx").on(t.tenantId), uniqueIndex("devices_tenant_hostname_uq").on(t.tenantId, t.hostname)]);

export const policies = sqliteTable("policies", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), name: text("name").notNull(),
  screenshotEnabled: integer("screenshot_enabled", { mode: "boolean" }).notNull(), screenshotIntervalSeconds: integer("screenshot_interval_seconds").notNull(),
  captureWindowTitles: integer("capture_window_titles", { mode: "boolean" }).notNull(),
  allowEmployeePause: integer("allow_employee_pause", { mode: "boolean" }).notNull(), scheduleJson: text("schedule_json").notNull(), ...audit,
}, (t) => [index("policies_tenant_idx").on(t.tenantId)]);

export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  deviceId: text("device_id").notNull().references(() => devices.id), userId: text("user_id").references(() => users.id),
  kind: text("kind", { enum: ["window", "afk", "input", "heartbeat"] }).notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(), durationMs: integer("duration_ms").notNull(), payloadJson: text("payload_json").notNull(),
}, (t) => [index("events_tenant_time_idx").on(t.tenantId, t.occurredAt), index("events_device_time_idx").on(t.deviceId, t.occurredAt)]);

export const screenshots = sqliteTable("screenshots", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  deviceId: text("device_id").notNull().references(() => devices.id), userId: text("user_id").references(() => users.id),
  objectKey: text("object_key").notNull(), thumbnailKey: text("thumbnail_key").notNull(), sha256: text("sha256").notNull(),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(), app: text("app"), title: text("title"), ...audit,
}, (t) => [index("screenshots_tenant_time_idx").on(t.tenantId, t.capturedAt), uniqueIndex("screenshots_object_uq").on(t.objectKey)]);

export const enrollmentTokens = sqliteTable("enrollment_tokens", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id),
  tokenHash: text("token_hash").notNull(), policyId: text("policy_id").references(() => policies.id),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), maxUses: integer("max_uses").notNull(), usedCount: integer("used_count").notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }), ...audit,
}, (t) => [uniqueIndex("enrollment_token_hash_uq").on(t.tokenHash), index("enrollment_tenant_idx").on(t.tenantId)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id"), actorUserId: text("actor_user_id"), action: text("action").notNull(),
  targetType: text("target_type").notNull(), targetId: text("target_id"), metadataJson: text("metadata_json").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("audit_tenant_time_idx").on(t.tenantId, t.occurredAt)]);
