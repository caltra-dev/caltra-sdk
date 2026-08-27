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
    const value = ServerEnvironmentSchema.parse(environment);
    this.apiKey = value.CALTRA_API_KEY;
    this.apiUrl = value.CALTRA_API_URL.replace(/\/+$/, "");
    this.tenantUserExternalId = value.CALTRA_TENANT_USER_EXTERNAL_ID;
    this.workspaceId = value.CALTRA_WORKSPACE_ID;
  }
}
