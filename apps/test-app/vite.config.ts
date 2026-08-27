import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { TestAppServerConfig } from "./server/config.js";
import { TestAppTokenPlugin } from "./server/token_plugin.js";
import { TestAppTokenProxy } from "./server/token_proxy.js";

export default defineConfig(({ command, mode }) => {
  const plugins = [...react()];
  if (command === "serve" && mode !== "test") {
    const environment = loadEnv(mode, process.cwd(), "");
    const config = new TestAppServerConfig(environment);
    plugins.push(new TestAppTokenPlugin(new TestAppTokenProxy(config)).toVitePlugin());
  }
  return { plugins };
});
