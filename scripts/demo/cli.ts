import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DemoConfig } from "./config.ts";

/** Builds the workspace packages, then starts the Signal Room demo in either connection mode. */
class DemoCli {
  async run() {
    const config = new DemoConfig(process.argv.slice(2), process.env);
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    console.log(`Caltra demo: ${config.environment.CALTRA_DEMO_MODE === "stub" ? "local API stub" : "real API"}`);
    const build = await this.runChild(["run", "build", "--workspace=@caltra/server", "--workspace=@caltra/react"], cwd, config.environment);
    if (build !== 0) { process.exitCode = build; return; }
    process.exitCode = await this.runChild(["exec", "--workspace=@caltra/test-app", "--", "vite", "--host", "127.0.0.1", "--open", "/"], cwd, config.environment);
  }
  private runChild(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, env, stdio: "inherit" });
      const stop = () => child.kill("SIGTERM");
      process.once("SIGINT", stop); process.once("SIGTERM", stop);
      child.once("error", reject);
      child.once("exit", code => { process.off("SIGINT", stop); process.off("SIGTERM", stop); resolve(code ?? 0); });
    });
  }
}
void new DemoCli().run().catch(() => { console.error("Demo could not start. Check the selected options and connection configuration."); process.exitCode = 1; });
