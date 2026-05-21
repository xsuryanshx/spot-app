import type { PipelineTurn } from "./types.js";

type SpectrumLikeMessage = {
  platform?: string;
  sender?: { id?: string };
  content: {
    type: string;
    text?: unknown;
    name?: unknown;
    mimeType?: unknown;
    duration?: unknown;
  };
};

type SpectrumLikeSpace = {
  id?: string;
};

export function toPipelineTurn(message: SpectrumLikeMessage, space: SpectrumLikeSpace): PipelineTurn {
  const base = {
    userId: message.sender?.id ?? "unknown-user",
    threadId: space.id ?? "unknown-thread",
    platform: message.platform
  };

  switch (message.content.type) {
    case "text":
      return {
        ...base,
        kind: "text",
        text: typeof message.content.text === "string" ? message.content.text.trim() : ""
      };
    case "attachment":
      return {
        ...base,
        kind: readMimeType(message.content.mimeType).startsWith("image/") ? "image" : "unsupported",
        text: "The user sent a food photo. Ask for a short text description if image analysis is unavailable.",
        attachmentName: readName(message.content.name),
        mimeType: readMimeType(message.content.mimeType)
      };
    case "voice":
      return {
        ...base,
        kind: "voice",
        text: "The user sent a voice note. Ask them to send the food log as text if transcription is unavailable.",
        attachmentName: readName(message.content.name),
        mimeType: readMimeType(message.content.mimeType)
      };
    default:
      return {
        ...base,
        kind: "unsupported",
        text: `Unsupported message type: ${message.content.type}`
      };
  }
}

function readName(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readMimeType(value: unknown): string {
  return typeof value === "string" ? value : "";
}
