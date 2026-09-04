import { z } from "zod";
import { CaltraApiError } from "./error.js";
import { CaltraSessionEventConnection } from "./event_connection.js";
import { CaltraClientTokenProvider } from "./token_provider.js";
import { CaltraAuthorizationCodeEndpointProvider } from "./authorization_code_provider.js";
import { CaltraSessionsClient } from "./sessions.js";
import type {
  CaltraAgent,
  CaltraClientOptions,
  CaltraMessageSubmission,
  CaltraPage,
  CaltraPageInput,
  CaltraSession,
  CaltraSessionCreateIfMissing,
  CaltraSessionLookup,
  CaltraSessionMessage,
} from "./types.js";

const PageSchema = <T extends z.ZodType>(item: T) => z.object({
  data: z.array(item),
  next_cursor: z.string().nullable(),
}).strict();

const AgentSchema = z.object({
  created_at: z.string(),
  description: z.string().nullable(),
  id: z.string(),
  name: z.string(),
}).strict();

const SessionSchema = z.object({
  agent: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
  created_at: z.string(),
  external_id: z.string().nullable(),
  id: z.string().uuid(),
  status: z.enum(["active", "closed"]),
  updated_at: z.string(),
}).strict();

const MessageSchema = z.object({
  created_at: z.string(),
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  status: z.enum(["streaming", "completed", "failed", "cancelled"]),
  text: z.string(),
}).strict();

const SubmissionSchema = z.object({
  message_id: z.string().uuid(),
  turn_id: z.string().uuid(),
}).strict();

/** Calls the versioned Caltra Client API without coupling applications to a React runtime. */
export class CaltraClient {
  readonly sessions: CaltraSessionsClient;
  private readonly apiUrl: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly tokenProvider: CaltraClientTokenProvider;

  constructor(options: CaltraClientOptions) {
    this.apiUrl = (options.apiUrl ?? "https://api.caltra.dev").replace(/\/+$/, "");
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
    const authorizationCodeProvider = options.authorizationCodeProvider
      ?? this.endpointAuthorizationCodeProvider(options);
    this.tokenProvider = new CaltraClientTokenProvider(
      this.apiUrl,
      this.fetchImplementation,
      authorizationCodeProvider,
    );
    this.sessions = new CaltraSessionsClient(this);
  }

  async listAgents(input: CaltraPageInput = {}): Promise<CaltraPage<CaltraAgent>> {
    return await this.getPage("/agents", input, PageSchema(AgentSchema));
  }

  async listSessions(input: CaltraPageInput = {}): Promise<CaltraPage<CaltraSession>> {
    return await this.getPage("/sessions", input, PageSchema(SessionSchema));
  }

  async createSession(input: { agentId: string }): Promise<CaltraSession> {
    return await this.request("/sessions", SessionSchema, {
      body: JSON.stringify({ agent_id: input.agentId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  async getSession(input: CaltraSessionCreateIfMissing): Promise<CaltraSession>;
  async getSession(input: CaltraSessionLookup): Promise<CaltraSession | null>;
  async getSession(
    input: CaltraSessionLookup | CaltraSessionCreateIfMissing,
  ): Promise<CaltraSession | null> {
    const createIfMissing = "createIfMissing" in input ? input.createIfMissing : undefined;
    try {
      return await this.request("/sessions/get", SessionSchema, {
        body: JSON.stringify({
          ...(createIfMissing ? {
            create_if_missing: { agent_external_id: createIfMissing.agentExternalId },
          } : {}),
          external_id: input.externalId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch (error) {
      if (!createIfMissing && error instanceof CaltraApiError
        && error.status === 404 && error.code === "resource_not_found") return null;
      throw error;
    }
  }

  async listSessionMessages(
    sessionId: string,
    input: CaltraPageInput = {},
  ): Promise<CaltraPage<CaltraSessionMessage>> {
    return await this.getPage(
      `/sessions/${encodeURIComponent(sessionId)}/messages`,
      input,
      PageSchema(MessageSchema),
    );
  }

  async openSessionEvents(
    sessionId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<CaltraSessionEventConnection> {
    const response = await this.fetchImplementation(this.url(
      `/sessions/${encodeURIComponent(sessionId)}/events`,
    ), {
      headers: await this.headers({ accept: "text/event-stream" }),
      method: "GET",
      signal: options.signal,
    });
    if (!response.ok) throw await CaltraApiError.fromResponse(response);
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      throw new Error("Caltra did not return an event stream.");
    }
    return new CaltraSessionEventConnection(response);
  }

  async sendMessage(sessionId: string, input: { text: string }): Promise<CaltraMessageSubmission> {
    return await this.request(
      `/sessions/${encodeURIComponent(sessionId)}/messages`,
      SubmissionSchema,
      {
        body: JSON.stringify({ text: input.text }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
  }

  async invalidateToken(): Promise<void> {
    this.tokenProvider.invalidate();
  }

  private async getPage<T>(
    path: string,
    input: CaltraPageInput,
    schema: z.ZodType<CaltraPage<T>>,
  ): Promise<CaltraPage<T>> {
    const url = this.url(path);
    if (input.limit !== undefined) url.searchParams.set("limit", String(input.limit));
    if (input.cursor !== undefined) url.searchParams.set("cursor", input.cursor);
    return await this.request(url, schema);
  }

  private async request<T>(
    path: string | URL,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.fetchImplementation(
      typeof path === "string" ? this.url(path) : path,
      {
        ...init,
        headers: await this.headers(init.headers),
      },
    );
    if (!response.ok) throw await CaltraApiError.fromResponse(response);
    return schema.parse(await response.json());
  }

  private async headers(input?: HeadersInit): Promise<Headers> {
    const headers = new Headers(input);
    headers.set("authorization", `Bearer ${await this.tokenProvider.getToken()}`);
    return headers;
  }

  private url(path: string): URL {
    return new URL(`${this.apiUrl}/client/v1${path}`);
  }

  private endpointAuthorizationCodeProvider(options: CaltraClientOptions): () => Promise<string> {
    if (!options.workspaceExternalId) {
      throw new Error("workspaceExternalId is required when authorizationCodeProvider is omitted.");
    }
    const provider = new CaltraAuthorizationCodeEndpointProvider(
      this.fetchImplementation,
      options.authorizationRoute ?? "/api/caltra/authorize",
      options.workspaceExternalId,
      options.authorizationHeadersProvider,
    );
    return async () => await provider.get();
  }
}
