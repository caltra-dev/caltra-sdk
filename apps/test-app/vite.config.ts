import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { TestAppApiProxy } from "./server/api_proxy.js";
import { LocalStub } from "./server/local_stub.js";
import { TestAppServerConfig } from "./server/config.js";
import { TestAppAuthorizationPlugin } from "./server/authorization_plugin.js";
import { TestAppAuthorizationProxy } from "./server/authorization_proxy.js";

export default defineConfig(({ command, mode }) => {
  const plugins = [...react(), tailwindcss()];
  let apiUrl = mode === "test" ? "http://caltra.test" : "https://api.caltra.dev";
  const environment = loadEnv(mode, process.cwd(), "");
  const stub = environment.CALTRA_DEMO_MODE === "stub" || (!environment.CALTRA_API_KEY && environment.CALTRA_DEMO_MODE !== "real");
  if (command === "serve" && mode !== "test" && stub) plugins.push(new LocalStub().toVitePlugin());
  if (command === "serve" && mode !== "test" && !stub) {
    const config = new TestAppServerConfig(environment);
    apiUrl = config.browserApiUrl;
    plugins.push(new TestAppApiProxy(config.apiUrl).toVitePlugin());
    plugins.push(new TestAppAuthorizationPlugin(new TestAppAuthorizationProxy(config)).toVitePlugin());
  }
  return {
    resolve: { alias: { "@": fileURLToPath(new URL("./src/upstream", import.meta.url)) } },
    build: { rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)), thread: fileURLToPath(new URL("./thread.html", import.meta.url)) } } },
    define: { __CALTRA_API_URL__: JSON.stringify(apiUrl), __CALTRA_LOCAL_STUB__: JSON.stringify(stub) },
    plugins,
    server: { allowedHosts: [".sprites.app"] },
  };
});
