import "./styles.css";
export { Thread, AssistantMessage, UserMessage, ThreadWelcome, ThreadHistorySkeleton, Composer } from "./upstream/components/assistant-ui/elements/thread.aui.js";
export type { ThreadProps, ThreadComponents } from "./upstream/components/assistant-ui/elements/thread.aui.js";
export { ThreadLocaleProvider, ThreadTextOverrides, useThreadText } from "./upstream/lib/thread-i18n.js";
export type { ThreadLocale, ThreadLabel } from "./upstream/lib/thread-i18n.js";
export { italian } from "./italian-labels.js";
export { ThreadPortalContainer } from "./upstream/lib/portal-container.js";
