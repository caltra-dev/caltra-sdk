/** All built-in chat copy, including accessible names, can be localized together. */
export interface CaltraChatLabels {
  chat: string;
  welcomeTitle: string;
  welcomeDescription: string;
  placeholder: string;
  messageInput: string;
  send: string;
  copy: string;
  copied: string;
  scrollToBottom: string;
  loading: string;
  connecting: string;
  recovering: string;
  connectionFailed: string;
  retry: string;
  messageFailed: string;
  assistant: string;
  user: string;
}

export const defaultCaltraChatLabels: CaltraChatLabels = {
  chat: "Conversation",
  welcomeTitle: "How can I help you today?",
  welcomeDescription: "",
  placeholder: "Write a message…",
  messageInput: "Message",
  send: "Send message",
  copy: "Copy",
  copied: "Copied",
  scrollToBottom: "Scroll to bottom",
  loading: "Loading conversation…",
  connecting: "Connecting…",
  recovering: "Reconnecting… Your conversation is still here.",
  connectionFailed: "The conversation could not connect. Please try again.",
  retry: "Try again",
  messageFailed: "This message could not be completed.",
  assistant: "Assistant",
  user: "You",
};
