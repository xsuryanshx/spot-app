import { describe, expect, it } from "vitest";
import { toPipelineTurn } from "../src/payload.js";

describe("toPipelineTurn", () => {
  it("maps text messages into pipeline turns", () => {
    expect(
      toPipelineTurn(
        { platform: "iMessage", sender: { id: "user-1" }, content: { type: "text", text: "  two eggs " } },
        { id: "thread-1" }
      )
    ).toMatchObject({
      kind: "text",
      text: "two eggs",
      userId: "user-1",
      threadId: "thread-1",
      platform: "iMessage"
    });
  });

  it("keeps image attachments from crashing the MVP path", () => {
    expect(
      toPipelineTurn(
        {
          sender: { id: "user-1" },
          content: { type: "attachment", name: "plate.jpg", mimeType: "image/jpeg" }
        },
        { id: "thread-1" }
      )
    ).toMatchObject({
      kind: "image",
      attachmentName: "plate.jpg",
      mimeType: "image/jpeg"
    });
  });
});
