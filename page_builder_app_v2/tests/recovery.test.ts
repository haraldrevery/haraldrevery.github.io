/*
 * Crash-recovery draft.
 *
 * The property that matters is NEGATIVE: a corrupt, stale or foreign draft must
 * never reach the restore prompt, and must not survive to prompt again. This
 * code only ever runs on a boot after something went wrong, so a bug here shows
 * up exactly once — at the worst possible moment.
 *
 * `invoke` is stubbed before the dynamic import; a static import would hoist
 * above mock.module and get the real module.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

let stored: { contents: string; modified: number } | null = null;
const calls: string[] = [];
/// Flipped by the "backend failure" test. A second mock.module call would
/// replace the stub for every test that ran AFTER it, which made the tests
/// below pass for the wrong reason.
let failRead = false;

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: any) => {
    calls.push(cmd);
    if (cmd === "read_recovery") {
      if (failRead) throw new Error("no config dir");
      return stored;
    }
    if (cmd === "write_recovery") {
      stored = { contents: args.contents, modified: Math.floor(Date.now() / 1000) };
      return undefined;
    }
    if (cmd === "clear_recovery") {
      stored = null;
      return undefined;
    }
    return undefined;
  },
}));

const { readRecovery, writeRecovery, clearRecovery, agoLabel } = await import(
  "../src/app/recovery"
);

const draft = (over: any = {}) => ({
  name: "mypage",
  file: { version: 2, exportSlug: "my-page", data: { root: { props: {} }, content: [] } },
  ...over,
});

beforeEach(() => {
  stored = null;
  calls.length = 0;
  failRead = false;
});

describe("a draft survives the round trip", () => {
  test("what was written is what comes back, plus the file's mtime", async () => {
    await writeRecovery(draft() as any);
    const found = await readRecovery();
    expect(found?.name).toBe("mypage");
    expect(found?.file.exportSlug).toBe("my-page");
    expect(typeof found?.modified).toBe("number");
  });

  test("an unnamed page round-trips with a null name", async () => {
    await writeRecovery(draft({ name: null }) as any);
    expect((await readRecovery())?.name).toBeNull();
  });

  test("nothing stored means nothing to restore", async () => {
    expect(await readRecovery()).toBeNull();
  });
});

describe("a draft that cannot be trusted is dropped, not offered", () => {
  test("unparseable JSON is discarded rather than prompted", async () => {
    stored = { contents: "{not json", modified: 0 };
    expect(await readRecovery()).toBeNull();
    // and it must not be left behind to fail again on the next launch
    expect(calls).toContain("clear_recovery");
    expect(stored).toBeNull();
  });

  test("a v1 draft is refused, matching the Open path's version guard", async () => {
    stored = { contents: JSON.stringify({ name: "x", file: { version: 1, blocks: [] } }), modified: 0 };
    expect(await readRecovery()).toBeNull();
    expect(stored).toBeNull();
  });

  test("a draft with no data is refused rather than restoring an empty page", async () => {
    stored = { contents: JSON.stringify({ name: "x", file: { version: 2 } }), modified: 0 };
    expect(await readRecovery()).toBeNull();
    expect(stored).toBeNull();
  });

  test("a backend failure is not a crash — booting must not depend on this", async () => {
    failRead = true;
    try {
      expect(await readRecovery()).toBeNull();
    } finally {
      failRead = false;
    }
  });
});

describe("clearing", () => {
  test("removes the draft so it is not offered again", async () => {
    await writeRecovery(draft() as any);
    await clearRecovery();
    expect(await readRecovery()).toBeNull();
  });
});

describe("the age shown in the restore prompt", () => {
  const now = 1_700_000_000_000;
  const secs = (msAgo: number) => (now - msAgo) / 1000;

  test("reads naturally across the ranges", () => {
    expect(agoLabel(secs(5_000), now)).toBe("moments ago");
    expect(agoLabel(secs(60_000), now)).toBe("1 minute ago");
    expect(agoLabel(secs(4 * 60_000), now)).toBe("4 minutes ago");
    expect(agoLabel(secs(60 * 60_000), now)).toBe("1 hour ago");
    expect(agoLabel(secs(5 * 3_600_000), now)).toBe("5 hours ago");
    expect(agoLabel(secs(24 * 3_600_000), now)).toBe("1 day ago");
    expect(agoLabel(secs(3 * 24 * 3_600_000), now)).toBe("3 days ago");
  });

  test("a clock skew into the future does not read as a negative age", () => {
    expect(agoLabel(secs(-10_000), now)).toBe("moments ago");
  });
});
