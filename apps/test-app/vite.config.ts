import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { TestAppApiProxy } from "./server/api_proxy.js";
import { demoConnectionSettings } from "./server/connections.js";
import { LocalStub } from "./server/local_stub.js";
import { TestAppServerConfig } from "./server/config.js";
import { TestAppAuthorizationPlugin } from "./server/authorization_plugin.js";
import { TestAppAuthorizationProxy } from "./server/authorization_proxy.js";

export default defineConfig(({ command, mode }) => {
  const plugins = [...react()];
  let apiUrl = mode === "test" ? "http://caltra.test" : "https://api.caltra.dev";
  const environment = loadEnv(mode, process.cwd(), "");
  const connections = demoConnectionSettings(environment);
  if (command === "serve" && mode !== "test") plugins.push(new LocalStub().toVitePlugin("/demo/stub"));
  if (command === "serve" && mode !== "test" && connections.realApiAvailable) {
    const config = new TestAppServerConfig(environment);
    apiUrl = config.browserApiUrl;
    plugins.push(new TestAppApiProxy(config.apiUrl).toVitePlugin());
    plugins.push(new TestAppAuthorizationPlugin(new TestAppAuthorizationProxy(config)).toVitePlugin());
  }
  return {
    define: { __CALTRA_API_URL__: JSON.stringify(apiUrl), __CALTRA_REAL_API_AVAILABLE__: JSON.stringify(connections.realApiAvailable), __CALTRA_DEFAULT_CONNECTION__: JSON.stringify(connections.defaultConnection) },
    plugins,
    server: { allowedHosts: [".sprites.app"] },
  };
});
