import { z } from "zod";
import type { CaltraClient } from "./client.js";
import { CaltraMemberBody } from "./members.js";
import type {
  CaltraBrowserProfile,
  CaltraBrowserProfileControl,
  CaltraBrowserProfileCreateInput,
  CaltraBrowserProfileLiveView,
  CaltraMember,
} from "./types.js";

const JSON_HEADERS = { "content-type": "application/json" };

const ProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  dedicated_sticky_ip: z.boolean(),
  role: z.enum(["owner", "operator", "viewer"]).optional(),
  active_session: z.object({
    id: z.string().uuid(),
    started_at: z.string(),
    controlled_by: z.enum(["agent", "user"]),
  }).strict().nullable(),
}).strict();
const ListSchema = z.object({ data: z.array(ProfileSchema) }).strict();
const LiveViewSchema = z.object({ url: z.string(), mode: z.literal("read_only"), session_id: z.string().uuid() }).strict();
const ControlSchema = z.object({ url: z.string(), mode: z.literal("interactive"), expires_at: z.string() }).strict();
const HeartbeatSchema = z.object({ expires_at: z.string() }).strict();

/**
 * Resource client for durable browser profiles: sharing, live view and the takeover lease.
 * Request bodies are snake_case on the wire; every error surfaces as CaltraApiError with the
 * server's problem code (for example no_active_session or not_controller).
 */
export class CaltraBrowserProfilesClient {
  constructor(private readonly client: CaltraClient) {}

  async create(input: CaltraBrowserProfileCreateInput): Promise<CaltraBrowserProfile> {
    const created = await this.client.requestResource("/browser-profiles", ProfileSchema, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ name: input.name, dedicated_sticky_ip: input.dedicatedStickyIp }),
    });
    return this.present(created);
  }

  async list(): Promise<CaltraBrowserProfile[]> {
    const page = await this.client.requestResource("/browser-profiles", ListSchema, { method: "GET" });
    return page.data.map((profile) => this.present(profile));
  }

  /** The server requires a role to grant access; removal ignores it. */
  async addMember(id: string, member: CaltraMember, role: "viewer" | "operator"): Promise<void> {
    await this.client.requestNoContent(`/browser-profiles/${encodeURIComponent(id)}/members`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ ...CaltraMemberBody.toWire(member), role }),
    });
  }

  async removeMember(id: string, member: CaltraMember): Promise<void> {
    await this.client.requestNoContent(`/browser-profiles/${encodeURIComponent(id)}/members`, {
      method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify(CaltraMemberBody.toWire(member)),
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.requestNoContent(`/browser-profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /** Always read-only, whatever the caller's role. Rejects with no_active_session when nothing is running. */
  async liveView(id: string): Promise<CaltraBrowserProfileLiveView> {
    const view = await this.client.requestResource(`/browser-profiles/${encodeURIComponent(id)}/live-view`, LiveViewSchema, { method: "GET" });
    return { url: view.url, mode: view.mode, sessionId: view.session_id };
  }

  /** Takes the lease, or re-issues the interactive URL when the current controller calls again (page reload). */
  async takeControl(id: string): Promise<CaltraBrowserProfileControl> {
    const grant = await this.client.requestResource(`/browser-profiles/${encodeURIComponent(id)}/control`, ControlSchema, {
      method: "POST", headers: JSON_HEADERS, body: "{}",
    });
    return { url: grant.url, mode: grant.mode, expiresAt: grant.expires_at };
  }

  /** Renews the lease; rejects with not_controller once it was lost. Returns the new expiry. */
  async heartbeat(id: string): Promise<{ expiresAt: string }> {
    const renewed = await this.client.requestResource(`/browser-profiles/${encodeURIComponent(id)}/control/heartbeat`, HeartbeatSchema, {
      method: "POST", headers: JSON_HEADERS, body: "{}",
    });
    return { expiresAt: renewed.expires_at };
  }

  /** keepalive lets the request finish while the page is closing (pagehide). */
  async releaseControl(id: string, options: { keepalive?: boolean } = {}): Promise<void> {
    await this.client.requestNoContent(`/browser-profiles/${encodeURIComponent(id)}/control`, {
      method: "DELETE", keepalive: options.keepalive,
    });
  }

  private present(profile: z.infer<typeof ProfileSchema>): CaltraBrowserProfile {
    return {
      id: profile.id, name: profile.name, dedicatedStickyIp: profile.dedicated_sticky_ip,
      ...(profile.role ? { role: profile.role } : {}),
      activeSession: profile.active_session && {
        id: profile.active_session.id, startedAt: profile.active_session.started_at, controlledBy: profile.active_session.controlled_by,
      },
    };
  }
}
