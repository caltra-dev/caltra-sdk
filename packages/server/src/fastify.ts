import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fastifyPlugin from "fastify-plugin";
import { z } from "zod";
import type { CaltraServerClient } from "./client.js";

const AuthorizationBodySchema = z.object({
  workspace_external_id: z.string().min(1).max(255),
}).strict();

export interface CaltraResolvedIdentity {
  firstName?: string;
  lastName?: string;
  userExternalId: string;
  workspaceExternalId: string;
}

export interface CaltraResolveIdentityInput {
  requestedWorkspaceExternalId: string;
}

export interface CaltraFastifyPluginOptions {
  authorizationRoute?: string;
  client: CaltraServerClient;
  resolveIdentity: (
    request: FastifyRequest,
    input: CaltraResolveIdentityInput,
  ) => Promise<CaltraResolvedIdentity | null>;
}

/** Installs the same-origin browser authorization bridge while leaving application identity policy to the host. */
class CaltraFastifyPlugin {
  static readonly plugin: FastifyPluginAsync<CaltraFastifyPluginOptions> = async (app, options) => {
    app.post(options.authorizationRoute ?? "/api/caltra/authorize", async (request, reply) => {
      const parsed = AuthorizationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        await reply.code(400).send({ code: "invalid_request", detail: "The request body is invalid." });
        return;
      }
      const origin = request.headers.origin;
      if (!origin) {
        await reply.code(400).send({ code: "invalid_origin", detail: "The Origin header is required." });
        return;
      }
      const identity = await options.resolveIdentity(request, {
        requestedWorkspaceExternalId: parsed.data.workspace_external_id,
      });
      if (!identity || identity.workspaceExternalId !== parsed.data.workspace_external_id) {
        await reply.code(401).send({ code: "unauthorized", detail: "The requested identity is unavailable." });
        return;
      }
      const authorization = await options.client.clientAuthorizations.create({
        origin,
        tenantUser: {
          externalId: identity.userExternalId,
          ...(identity.firstName === undefined ? {} : { firstName: identity.firstName }),
          ...(identity.lastName === undefined ? {} : { lastName: identity.lastName }),
        },
        workspace: { externalId: identity.workspaceExternalId },
      });
      await reply
        .header("Cache-Control", "no-store")
        .header("Pragma", "no-cache")
        .send({
          authorization_code: authorization.authorizationCode,
          expires_at: authorization.expiresAt.toISOString(),
        });
    });
  };
}

export default fastifyPlugin(CaltraFastifyPlugin.plugin, {
  fastify: "5.x",
  name: "@caltra/server/fastify",
});
