import { z } from "zod";

const ServerEnvironmentSchema = z.object({
  CALTRA_API_KEY: z.string().min(1),
  CALTRA_API_URL: z.url().default("http://api.caltra"),
  CALTRA_TENANT_USER_EXTERNAL_ID: z.string().min(1).default("sdk-test-user"),
  CALTRA_WORKSPACE_ID: z.string().uuid(),
});

/** Resolves secrets at the Vite server boundary so browser modules cannot import them. */
export class TestAppServerConfig {
  readonly apiKey: string;
  readonly apiUrl: string;
  readonly tenantUserExternalId: string;
  readonly workspaceId: string;

  constructor(environment: Record<string, string | undefined>) {
    // npm exposes `npm run` options as npm_config_* values. Resolve those first so
    // command-line overrides remain optional and the .env configuration stays useful.
    const value = ServerEnvironmentSchema.parse({
      CALTRA_API_KEY: environment.npm_config_api_key ?? environment.CALTRA_API_KEY,
      CALTRA_API_URL: environment.npm_config_caltra_url ?? environment.CALTRA_API_URL,
      CALTRA_TENANT_USER_EXTERNAL_ID:
        environment.npm_config_tenant_user_external_id
        ?? environment.CALTRA_TENANT_USER_EXTERNAL_ID,
      CALTRA_WORKSPACE_ID:
        environment.npm_config_workspace_id ?? environment.CALTRA_WORKSPACE_ID,
    });
    this.apiKey = value.CALTRA_API_KEY;
    this.apiUrl = value.CALTRA_API_URL.replace(/\/+$/, "");
    this.tenantUserExternalId = value.CALTRA_TENANT_USER_EXTERNAL_ID;
    this.workspaceId = value.CALTRA_WORKSPACE_ID;
  }
}
