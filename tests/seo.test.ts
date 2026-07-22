import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import llmsHandler from "../api/llms-txt.js";

test("the landing page declares its canonical URL", async () => {
  const html = await readFile("index.html", "utf8");

  expect(html).toContain('<link rel="canonical" href="https://akron.micr.dev/" />');
  expect(html).toContain('"@type": "SoftwareSourceCode"');
  expect(html).not.toContain('"@type": "SoftwareApplication"');
});

test("llms.txt identifies Akron with canonical resources", async () => {
  const response = {
    headers: new Map<string, string>(),
    statusCode: 0,
    body: "",
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: string) {
      this.body = body;
    },
  };

  await llmsHandler({}, response);

  expect(response.statusCode).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  expect(response.body).toContain("# Akron");
  expect(response.body).toContain("https://akron.micr.dev/docs");
  expect(response.body).not.toContain("akron-cdb9eaf4.mintlify.app");
});
