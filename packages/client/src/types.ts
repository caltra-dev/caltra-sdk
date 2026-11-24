import type { CaltraAuthProvider } from "./auth_provider_interface.js";
/** JSON-only application data captured with a user message; never projected into UI history. */
export type CaltraJsonValue = string | number | boolean | null | readonly CaltraJsonValue[] | { readonly [key: string]: CaltraJsonValue };
export type CaltraMessageContext = { readonly [key: string]: CaltraJsonValue };
export interface CaltraMessageInput {
  text: string;
  requestId?: string;
  context?: CaltraMessageContext;
  modelSelection?: CaltraModelSelection;
  attachmentIds?: string[];
}

/** Display metadata only; original bytes stay in private attachment storage. */
export interface CaltraAttachment { id: string; name: string; media_type: string; size_bytes: number; }

export type CaltraAuthorizationCodeProvider = () => Promise<string>;

export interface CaltraTokenConfiguration {
  clientToken: string;
  workspaceId?: string;
  expiresAt: Date;
  refreshAfter: Date;
}

export interface CaltraClientOptions {
  auth?: CaltraAuthProvider;
  apiUrl?: string;
  authorizationCodeProvider?: CaltraAuthorizationCodeProvider;
  authorizationHeadersProvider?: () => Promise<HeadersInit>;
  authorizationRoute?: string;
  fetch?: typeof fetch;
  workspaceExternalId?: string;
}

export interface CaltraPageInput {
  cursor?: string;
  limit?: number;
}

export interface CaltraPage<T> {
  data: T[];
  next_cursor: string | null;
}

export interface CaltraSession {
  /** Authoritative queued/running turn state; absent only on older servers. */
  is_running?: boolean;
  auto_name: boolean;
  title: string | null;
  title_source: "generated" | "manual" | null;
  title_updated_at: string | null;
  agentIdentity: { id: string; name: string } | null;
  agent: { id: string; name: string };
  created_at: string;
  external_id: string | null;
  id: string;
  status: "active" | "closed" | "expired" | "revoked";
  updated_at: string;
}

export interface CaltraSessionLookup {
  externalId: string;
}

export interface CaltraToolCall {
  id: string; name: string;
  /** Absent on summary pages; load details when the call is inspected. */
  arguments?: Record<string, unknown>;
  status: "running" | "completed" | "failed" | "cancelled"; result?: unknown;
}

export interface CaltraSessionMessage {
  attachments?: CaltraAttachment[];
  created_at: string;
  id: string;
  role: "user" | "assistant";
  status: "streaming" | "completed" | "failed" | "cancelled";
  text: string;
  tool_calls?: CaltraToolCall[];
  /** Availability only; text is fetched through a separate reasoning resource. */
  reasoning?: { status: "streaming" | "completed" };
}

interface CaltraSessionEventData {
  message_id: string;
  session_id: string;
  turn_id: string;
}

export interface CaltraMessageStartedEvent {
  data: CaltraSessionEventData;
  event: "message.started";
  id: string;
}

export interface CaltraMessageDeltaEvent {
  data: CaltraSessionEventData & { delta: string };
  event: "message.delta";
  id: string;
}

export interface CaltraMessageCompletedEvent {
  data: CaltraSessionEventData;
  event: "message.completed";
  id: string;
}

export interface CaltraSessionUpdatedEvent {
  data: { session_id: string };
  event: "session.updated";
  id: string;
}

export interface CaltraToolStartedEvent {
  event: "tool.started"; id: string;
  data: CaltraSessionEventData & { tool_call_id: string; tool_name: string };
}

export interface CaltraReasoningSnapshot {
  message_id: string; stream_id: string | null; sequence: number;
  status: "streaming" | "completed" | "failed" | "cancelled";
  parts: Array<{ position: number; text: string; status: "streaming" | "completed" }>;
}

export interface CaltraReasoningEvent {
  event: "reasoning.delta"; id: string;
  data: CaltraSessionEventData & { stream_id: string; sequence: number; position: number;
    kind: "part_started" | "content_delta" | "part_completed"; delta: string | null };
}

export interface CaltraReasoningMetadataEvent {
  event: "reasoning.updated"; id: string;
  data: CaltraSessionEventData & { status: "streaming" | "completed" };
}

export type CaltraSessionEvent =
  | { event:"session.live.updated"; id:string; data:{session_id:string;connection_id:string;state_revision:number} }
  | CaltraReasoningEvent
  | CaltraReasoningMetadataEvent
  | CaltraToolStartedEvent
  | CaltraMessageStartedEvent
  | CaltraMessageDeltaEvent
  | CaltraMessageCompletedEvent
  | CaltraSessionUpdatedEvent;

export interface CaltraMessageSubmission {
  message_id: string;
  turn_id: string;
}

export interface CaltraApiProblem {
  code: string;
  detail: string;
  request_id: string;
  retryable: boolean;
  status: number;
  title: string;
  type: string;
}

/** Explicit selection for one new turn; omission preserves the session default. */
export interface CaltraModelSelection { platformModelId: string; reasoningLevel: string | null }
export interface CaltraModelChoice { platform_model_id: string; model_name: string; reasoning_level: string | null; is_default: boolean }

/** Exactly one principal that can be granted or revoked access to a shared resource. */
export type CaltraMember = { agentIdentityId: string } | { tenantUserId: string };

export type CaltraBrowserProfileRole = "owner" | "operator" | "viewer";

export interface CaltraBrowserProfileActiveSession {
  id: string;
  startedAt: string;
  controlledBy: "agent" | "user";
}

export interface CaltraBrowserProfile {
  id: string;
  name: string;
  dedicatedStickyIp: boolean;
  /** Absent only on the create response, where the caller is always the owner. */
  role?: CaltraBrowserProfileRole;
  activeSession: CaltraBrowserProfileActiveSession | null;
}

export interface CaltraBrowserProfileCreateInput { name: string; dedicatedStickyIp?: boolean }

/** Read-only live view URL; it stops working when the browser session ends. */
export interface CaltraBrowserProfileLiveView { url: string; mode: "read_only"; sessionId: string }

/** Interactive URL; control lapses at expiresAt unless renewed with a heartbeat. */
export interface CaltraBrowserProfileControl { url: string; mode: "interactive"; expiresAt: string }

export interface CaltraWebCredential { id: string; label: string; origin: string; username: string; createdAt: string }

export interface CaltraWebCredentialCreateInput { label: string; origin: string; username: string; password: string }
