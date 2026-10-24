import type { ModelContext } from "@assistant-ui/react";
import type { CaltraModelSelection } from "@caltra/client";

/** Only the hosted Caltra selection contract crosses this boundary. */
export function modelSelectionFromContext(context?: ModelContext): CaltraModelSelection | undefined {
  const config = context?.config;
  if (config?.modelName === undefined && config?.reasoningEffort === undefined) return undefined;
  if (typeof config?.modelName !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.modelName)) {
    throw new Error("ModelContext config.modelName must be a Caltra platform model UUID from getSessionModelChoices().");
  }
  const effort = config.reasoningEffort;
  if (effort !== undefined && (typeof effort !== "string" || !effort.trim())) {
    throw new Error("ModelContext config.reasoningEffort must be a permitted reasoning level or provider-default.");
  }
  return { platformModelId: config.modelName, reasoningLevel: effort === undefined || effort === "provider-default" ? null : effort };
}
