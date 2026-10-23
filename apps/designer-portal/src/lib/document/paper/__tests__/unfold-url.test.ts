import {
  closedSearch,
  closedUrl,
  consumeLanding,
  parseUnfoldSearch,
  readLanding,
  unfoldSearch,
  unfoldUrl,
  type UnfoldAddress,
} from "@/lib/document/paper/unfold-url";
import { parseBuildRoomSearch } from "@/lib/document/pieces/build-room-url";

const ROOM = "6f1c2b3a-1111-4222-8333-444455556666";
const LINE = "0a9b8c7d-aaaa-4bbb-8ccc-ddddeeeeffff";
const money = { canSeeMoney: true };

function parse(search: string, opts = money) {
  return parseUnfoldSearch(new URLSearchParams(search), opts);
}

describe("unfold-url", () => {
  it("round-trips unfold, lens, room and line", () => {
    const address: UnfoldAddress = {
      kind: "pieces",
      lens: "spec",
      room: ROOM,
      line: LINE,
    };
    const search = unfoldSearch("", address);
    expect(search).toBe(
      `?unfold=pieces&lens=spec&room=${ROOM}&line=${LINE}`,
    );
    expect(parse(search)).toEqual(address);
  });

  it("round-trips the whole-job and rail places", () => {
    for (const room of [null, "throughout", "unassigned", "removed"]) {
      const address: UnfoldAddress = {
        kind: "pieces",
        lens: "release",
        room,
        line: null,
      };
      expect(parse(unfoldSearch("", address))).toEqual(address);
    }
  });

  it("reads lens and room exactly as parseBuildRoomSearch does", () => {
    for (const search of [
      "?unfold=pieces&lens=price&room=r1",
      "?unfold=pieces&lens=bogus",
      "?unfold=pieces&lens=finishes&room=%20",
      "?unfold=pieces",
    ]) {
      for (const canSeeMoney of [true, false]) {
        const params = new URLSearchParams(search);
        const unfolded = parseUnfoldSearch(params, { canSeeMoney });
        const route = parseBuildRoomSearch(params, { canSeeMoney });
        expect(unfolded && { lens: unfolded.lens, room: unfolded.room }).toEqual(
          route,
        );
      }
    }
  });

  it("reads an unknown lens, or Price without money, as Rough in", () => {
    expect(parse("?unfold=pieces&lens=purchase")?.lens).toBe("rough");
    expect(parse("?unfold=pieces&lens=price", { canSeeMoney: false })?.lens).toBe(
      "rough",
    );
    expect(parse("?unfold=pieces&lens=price")?.lens).toBe("price");
  });

  it("reads nothing unfolded for a missing or unknown kind", () => {
    expect(parse("")).toBeNull();
    expect(parse("?lens=spec&room=r1")).toBeNull();
    expect(parse("?unfold=ledger&lens=spec")).toBeNull();
    expect(parseUnfoldSearch(null, money)).toBeNull();
  });

  it("drops a line that is not uuid-shaped", () => {
    expect(parse("?unfold=pieces&line=not-a-line")?.line).toBeNull();
    expect(parse("?unfold=pieces&line=%27%3B--")?.line).toBeNull();
    expect(
      unfoldSearch("", { kind: "pieces", lens: "spec", room: null, line: "x" }),
    ).toBe("?unfold=pieces&lens=spec");
  });

  it("ignores and keeps parameters it does not own", () => {
    const search = unfoldSearch("?sheet=call&lens=rough&utm=a", {
      kind: "pieces",
      lens: "spec",
      room: null,
      line: null,
    });
    const params = new URLSearchParams(search);
    expect(params.get("sheet")).toBe("call");
    expect(params.get("utm")).toBe("a");
    expect(params.getAll("lens")).toEqual(["spec"]);
    expect(parse(`${search}&extra=1`)).toEqual({
      kind: "pieces",
      lens: "spec",
      room: null,
      line: null,
    });
  });

  it("folds away exactly the unfold parameters", () => {
    expect(
      closedSearch(`?sheet=call&unfold=pieces&lens=spec&room=${ROOM}&line=${LINE}`),
    ).toBe("?sheet=call");
    expect(closedSearch("?unfold=pieces&lens=spec")).toBe("");
  });

  it("builds whole URLs that keep the path and hash", () => {
    const location = { pathname: "/doc/d1", search: "?sheet=call", hash: "#x" };
    const url = unfoldUrl(location, {
      kind: "pieces",
      lens: "spec",
      room: ROOM,
      line: null,
    });
    expect(url).toBe(`/doc/d1?sheet=call&unfold=pieces&lens=spec&room=${ROOM}#x`);
    const reopened = new URL(url, "http://localhost");
    expect(closedUrl(reopened)).toBe("/doc/d1?sheet=call#x");
  });

  describe("landing", () => {
    it("maps land onto the Landing union", () => {
      const read = (s: string) => readLanding(new URLSearchParams(s));
      expect(read("?land=region:project-ffe")).toEqual({
        kind: "region",
        region: "project-ffe",
      });
      expect(read("?land=section:money")).toEqual({
        kind: "section",
        sectionKey: "money",
      });
      expect(read(`?land=line:${LINE}`)).toEqual({ kind: "ffe", ffeItemId: LINE });
      expect(read("?land=line:nope")).toBeNull();
      expect(read("?land=act:send")).toBeNull();
    });

    it("still lands the legacy ffeItemId alias", () => {
      expect(readLanding(new URLSearchParams(`?ffeItemId=${LINE}`))).toEqual({
        kind: "ffe",
        ffeItemId: LINE,
      });
    });

    it("consumes land once", () => {
      const first = consumeLanding(`?land=line:${LINE}&sheet=call`);
      expect(first.landing).toEqual({ kind: "ffe", ffeItemId: LINE });
      expect(first.search).toBe("?sheet=call");
      const second = consumeLanding(first.search);
      expect(second.landing).toBeNull();
      expect(second.search).toBe("?sheet=call");
    });
  });
});
