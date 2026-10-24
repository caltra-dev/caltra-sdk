import { parseArgs } from "node:util";

/** Resolves demo CLI options once; secrets are forwarded only in the child environment. */
export class DemoConfig {
  readonly environment: NodeJS.ProcessEnv;
  constructor(argv: string[], environment: NodeJS.ProcessEnv) {
    const { values } = parseArgs({ args: argv, options: {
      "local-stub": { type: "boolean" }, "caltra-api-key": { type: "string" },
      "caltra-api-url": { type: "string" }, "workspace-id": { type: "string" },
    } });
    const key = values["caltra-api-key"] ?? environment.CALTRA_API_KEY;
    const stub = values["local-stub"] ?? !key;
    this.environment = { ...environment, CALTRA_DEMO_MODE: stub ? "stub" : "real" };
    for (const name of ["npm_config_caltra_api_key", "npm_config_api_key"]) delete this.environment[name];
    if (stub) {
      delete this.environment.CALTRA_API_KEY;
    } else {
      this.environment.CALTRA_API_KEY = key;
      this.environment.CALTRA_API_URL = values["caltra-api-url"] ?? environment.CALTRA_API_URL ?? "https://api.caltra.dev";
      if (values["workspace-id"]) this.environment.CALTRA_WORKSPACE_ID = values["workspace-id"];
    }
  }
}
