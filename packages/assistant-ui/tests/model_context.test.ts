import { describe, expect, it } from "vitest";
import { modelSelectionFromContext } from "../src/model_context.js";
const id = "90000000-0000-4000-8000-000000000001";

describe("Caltra ModelContext mapping", () => {
  it("omits selection without model configuration and does not forward provider credentials or instructions", () => {
    expect(modelSelectionFromContext()).toBeUndefined();
    expect(modelSelectionFromContext({ system: "instructions", tools: {}, callSettings: { temperature: 0.2 }, config: { apiKey: "test-key", baseUrl: "https://unused.test" } })).toBeUndefined();
    expect(modelSelectionFromContext({ config: { modelName: id, reasoningEffort: "high", apiKey: "test-key", baseUrl: "https://unused.test" } })).toEqual({ platformModelId: id, reasoningLevel: "high" });
  });
  it("maps absent or explicit provider-default effort to null", () => {
    for (const reasoningEffort of [undefined, "provider-default"]) expect(modelSelectionFromContext({ config: { modelName: id, reasoningEffort } })).toEqual({ platformModelId: id, reasoningLevel: null });
  });
  it("rejects ambiguous model names and effort without a model instead of silently sending a different selection", () => {
    expect(() => modelSelectionFromContext({ config: { modelName: "some-provider/model" } })).toThrow("platform model UUID");
    expect(() => modelSelectionFromContext({ config: { reasoningEffort: "high" } })).toThrow("platform model UUID");
    expect(() => modelSelectionFromContext({ config: { modelName: id, reasoningEffort: "" } })).toThrow("reasoning level");
  });
});
