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

export interface CaltraAgent {
  created_at: string;
  description: string | null;
  id: string;
  name: string;
}

export interface CaltraSession {
  agent: { id: string; name: string } | null;
  runtime: { id: string; name: string };
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
  createIfMissing: { agentExternalId: string };
}

export interface CaltraSessionMessage {
  created_at: string;
  id: string;
  role: "user" | "assistant";
  status: "streaming" | "completed" | "failed" | "cancelled";
  text: string;
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

export type CaltraSessionEvent =
  | CaltraMessageStartedEvent
  | CaltraMessageDeltaEvent
  | CaltraMessageCompletedEvent;

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
