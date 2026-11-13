import { describe, expect, it } from "vitest";
import { buildNotification, SentOnce, type CommunityDeps } from "../server/communityPush.ts";

const LEW = "11111111-1111-4111-8111-111111111111";
const AN = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-11-09T12:00:00Z");
const justNow = "2026-11-09T11:59:30Z";

function deps(overrides: Partial<CommunityDeps> = {}): CommunityDeps {
  return {
    message: async (id) => (id === "m1" ? { sender: AN, recipient: LEW, body: "Chào Lew 👋 mai đi ăn phở không?", created_at: justNow } : null),
    comment: async (id) => (id === "c1" ? { author: AN, body: "Ngon quá!", created_at: justNow, post_author: LEW } : null),
    like: async (postId, userId) => (postId === "p1" && userId === AN ? { created_at: justNow, post_author: LEW } : null),
    friendship: async (requester, addressee) =>
      requester === AN && addressee === LEW ? { status: "pending", created_at: justNow } : null,
    profile: async (id) =>
      id === LEW ? { username: "lew", display_name: "Lew", notify: true, language: "vi" } : { username: "an.nguyen", display_name: "An Nguyễn", notify: true, language: "en" },
    blocked: async () => false,
    ...overrides,
  };
}

describe("community notifications", () => {
  it("says a photo was sent when a message has no text", async () => {
    const photo = deps({ message: async () => ({ sender: AN, recipient: LEW, body: "", image_path: `${AN}/x.jpg`, created_at: justNow }) });
    expect((await buildNotification(photo, AN, "message", "m2", NOW))?.message.body).toBe("📷 Đã gửi một ảnh");
  });

  it("notifies the recipient of a message, in their language", async () => {
    const note = await buildNotification(deps(), AN, "message", "m1", NOW);
    expect(note).toEqual({
      to: LEW,
      message: { title: "💬 An Nguyễn", body: "Chào Lew 👋 mai đi ăn phở không?", url: "/?tab=community&section=chats", tag: `chat-${AN}` },
    });
  });

  it("covers comments, likes, requests and accepted requests", async () => {
    expect((await buildNotification(deps(), AN, "comment", "c1", NOW))?.message.title).toBe("💬 An Nguyễn đã bình luận bài viết của bạn");
    expect((await buildNotification(deps(), AN, "like", "p1", NOW))?.message.title).toBe("❤️ An Nguyễn đã thích bài viết của bạn");
    expect((await buildNotification(deps(), AN, "friend_request", LEW, NOW))?.to).toBe(LEW);
    // Lew accepted An's request: An (English) is told
    const acceptedDeps = deps({ friendship: async (r, a) => (r === AN && a === LEW ? { status: "accepted", created_at: justNow } : null) });
    const accepted = await buildNotification(acceptedDeps, LEW, "friend_accept", AN, NOW);
    expect(accepted).toMatchObject({ to: AN, message: { title: "🤝 Lew accepted your friend request" } });
  });

  it("refuses events the caller didn't do", async () => {
    expect(await buildNotification(deps(), LEW, "message", "m1", NOW)).toBeNull(); // Lew isn't the sender
    expect(await buildNotification(deps(), LEW, "comment", "c1", NOW)).toBeNull();
    expect(await buildNotification(deps(), LEW, "like", "p1", NOW)).toBeNull();
    expect(await buildNotification(deps(), AN, "message", "nope", NOW)).toBeNull();
  });

  it("ignores old events (no replaying)", async () => {
    expect(await buildNotification(deps(), AN, "message", "m1", NOW + 60 * 60 * 1000)).toBeNull();
  });

  it("respects notification settings and blocks", async () => {
    const off = deps({ profile: async (id) => ({ username: id === LEW ? "lew" : "an", display_name: "", notify: id !== LEW, language: "en" }) });
    expect(await buildNotification(off, AN, "message", "m1", NOW)).toBeNull();
    expect(await buildNotification(deps({ blocked: async () => true }), AN, "message", "m1", NOW)).toBeNull();
  });

  it("doesn't notify people about their own activity", async () => {
    const own = deps({ like: async () => ({ created_at: justNow, post_author: AN }) });
    expect(await buildNotification(own, AN, "like", "p1", NOW)).toBeNull();
  });

  it("sends each event once (liking, unliking and liking again doesn't spam)", () => {
    const once = new SentOnce();
    expect(once.first("like:p1:an", NOW)).toBe(true);
    expect(once.first("like:p1:an", NOW + 1000)).toBe(false);
    expect(once.first("like:p1:an", NOW + 25 * 60 * 60 * 1000)).toBe(true);
  });
});
