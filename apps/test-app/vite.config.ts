import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { TestAppServerConfig } from "./server/config.js";
import { TestAppAuthorizationPlugin } from "./server/authorization_plugin.js";
import { TestAppAuthorizationProxy } from "./server/authorization_proxy.js";

export default defineConfig(({ command, mode }) => {
  const plugins = [...react()];
  let apiUrl = mode === "test" ? "http://caltra.test" : "https://api.caltra.dev";
  if (command === "serve" && mode !== "test") {
    const environment = loadEnv(mode, process.cwd(), "");
    const config = new TestAppServerConfig(environment);
    apiUrl = config.apiUrl;
    plugins.push(new TestAppAuthorizationPlugin(new TestAppAuthorizationProxy(config)).toVitePlugin());
  }
  return {
    define: { __CALTRA_API_URL__: JSON.stringify(apiUrl) },
    plugins,
    server: { allowedHosts: [".sprites.app"] },
  };
});
