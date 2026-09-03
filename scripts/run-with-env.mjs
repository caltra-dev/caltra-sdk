import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";

const separatorIndex = process.argv.indexOf("--", 2);
const profile = process.argv[2];
const command = separatorIndex >= 0 ? process.argv[separatorIndex + 1] : undefined;
const commandArguments = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 2) : [];

if (!profile || separatorIndex < 0 || !command) {
  console.error("Usage: node scripts/run-with-env.mjs <profile> -- <command> [...arguments]");
  process.exitCode = 2;
} else {
  loadEnvFile(profile);
  const child = spawn(command, commandArguments, { env: process.env, stdio: "inherit" });
  const forward = (signal) => child.kill(signal);
  process.once("SIGINT", forward);
  process.once("SIGTERM", forward);
  child.once("error", (error) => {
    console.error(`Could not start ${command}: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.removeListener("SIGINT", forward);
    process.removeListener("SIGTERM", forward);
    process.exitCode = signal ? 1 : code ?? 1;
  });
}
