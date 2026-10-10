import { expect, test } from "bun:test";
import { sanitizeErrorEvent } from "../observability/privacy.js";

test("preserves source-map debug IDs with matching sanitized frame paths", () => {
  const debugId = "17c38796-6b51-4db0-b49b-76f6ed70c301";
  const codeFile = "https://site.example/assets/app-a1b2.js?token=private#private";
  const event = {
    exception: { values: [{ type: "Error", value: "private", stacktrace: {
      frames: [{ filename: codeFile, lineno: 11, colno: 27 }],
    } }] },
    debug_meta: { images: [{ type: "sourcemap", debug_id: debugId, code_file: codeFile, private: "private" }] },
  };
  const clean = sanitizeErrorEvent(event)!;
  expect(clean.debug_meta.images).toEqual([{ type: "sourcemap", debug_id: debugId, code_file: "/assets/app-a1b2.js" }]);
  expect(clean.exception.values[0].stacktrace.frames[0].filename).toBe(clean.debug_meta.images[0].code_file);
  expect(JSON.stringify(clean)).not.toContain("private");
});
