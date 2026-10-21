export type CaltraAuthorizationCodeProvider = () => Promise<string>;

export interface CaltraTokenConfiguration {
  clientToken: string;
  expiresAt: Date;
  refreshAfter: Date;
}

export interface CaltraClientOptions {
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

export interface CaltraAgentIdentity {
  created_at: string;
  description: string | null;
  id: string;
  name: string;
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

export interface CaltraSessionCreateIfMissing extends CaltraSessionLookup {
  createIfMissing: { agentIdentityExternalId: string; autoName?: boolean };
}

export interface CaltraToolCall {
  id: string; name: string;
  /** Absent on summary pages; load details when the call is inspected. */
  arguments?: Record<string, unknown>;
  status: "running" | "completed" | "failed" | "cancelled"; result?: unknown;
}

export interface CaltraSessionMessage {
  created_at: string;
  id: string;
  role: "user" | "assistant";
  status: "streaming" | "completed" | "failed" | "cancelled";
  text: string;
  tool_calls?: CaltraToolCall[];
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

export type CaltraSessionEvent =
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
