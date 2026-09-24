import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import GenerateCertificate from "../apps/OpenSignServer/cloud/parsefunction/pdf/GenerateCertificate.js";
import { mailTemplate } from "../apps/OpenSignServer/Utils.js";
import fontkit from "../apps/OpenSignServer/node_modules/@pdf-lib/fontkit/dist/fontkit.es.js";
import { getDocument } from "../apps/OpenSign/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flat = (object, prefix = "") =>
  Object.fromEntries(
    Object.entries(object).flatMap(([k, v]) =>
      typeof v === "object"
        ? Object.entries(flat(v, prefix + k + "."))
        : [[prefix + k, v]]
    )
  );
const locale = (lang) =>
  flat(
    JSON.parse(
      fs.readFileSync(
        path.join(root, `apps/OpenSign/public/locales/${lang}/translation.json`)
      )
    )
  );

test("Japanese covers the English keys and preserves variables and numbered markup", () => {
  const en = locale("en"),
    ja = locale("ja");
  assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort());
  const tokens = (value) =>
    [...value.matchAll(/{{\s*[-\w]+\s*}}|<\/?\d+>/g)].map((m) => m[0]).sort();
  for (const [key, value] of Object.entries(en)) {
    assert.equal(typeof ja[key], "string", key);
    assert.ok(ja[key].length || !value.length, key);
    assert.deepEqual(tokens(ja[key]), tokens(value), key);
  }
});

test("Japanese invitation includes the document, sender, expiry and signing URL", () => {
  const values = {
    senderName: "田中花子",
    title: "基本契約書",
    senderMail: "sender@example.test",
    organization: "株式会社テスト",
    localExpireDate: "2026-12-31",
    note: "ご確認ください",
    signingUrl: "https://example.test/login/test-token"
  };
  const result = mailTemplate(values);
  assert.match(result.subject, /署名依頼/);
  assert.match(result.subject, /田中花子/);
  assert.match(result.body, /文書を確認して署名する/);
  for (const value of Object.values(values))
    assert.ok(result.body.includes(value), value);
});

test("Account mail translations retain their template variables and links", () => {
  const read = (name) =>
    fs.readFileSync(path.join(root, "apps/OpenSignServer/files", name), "utf8");
  for (const name of [
    "password_reset_email.html",
    "password_reset_email.txt",
    "verification_email.html",
    "verification_email.txt"
  ]) {
    assert.ok(read(name).includes("{{{link}}}"), name);
  }
  assert.ok(read("password_reset_email.html").includes("{{username}}"));
  assert.ok(read("verification_email.html").includes("{{appName}}"));
  assert.match(read("password_reset_email.html"), /パスワードを再設定する/);
  assert.match(read("verification_email.html"), /メールアドレスを確認する/);
});

test("Bundled font supports Japanese names and contract text", () => {
  const font = fontkit.create(
    fs.readFileSync(
      path.join(root, "apps/OpenSignServer/public/fonts/ipaexg.ttf")
    )
  );
  for (const character of "日本語株式会社山田太郎髙﨑あいうアイウ契約書１２３①〒￥ABC") {
    assert.ok(font.hasGlyphForCodePoint(character.codePointAt(0)), character);
  }
});

test("Upstream certificate layout retains Japanese names and the full document hash", async () => {
  const signers = Array.from({ length: 8 }, (_, i) => ({
    objectId: `signer${i}`,
    Name: `山田太郎${i}`,
    Email: `signer${i}@example.test`
  }));
  const previous = process.cwd();
  let bytes;
  try {
    // Upstream certificate assets are resolved from the API working directory.
    process.chdir(path.join(root, "apps/OpenSignServer"));
    bytes = await GenerateCertificate({
      objectId: "test-contract",
      Name: "基本契約書",
      ExtUserPtr: {
        Name: "田中花子",
        Email: "sender@example.test",
        Company: "株式会社テスト",
        Timezone: "Asia/Tokyo"
      },
      Signers: signers,
      createdAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-02T00:00:00Z",
      DocumentHash: "a".repeat(64),
      AuditTrail: signers.map((s) => ({
        UserPtr: { objectId: s.objectId },
        SignedOn: "2026-01-02T00:00:00Z",
        ViewedOn: "2026-01-01T00:00:00Z",
        ipAddress: "192.0.2.1"
      }))
    });
  } finally {
    process.chdir(previous);
  }
  const doc = await getDocument({ data: bytes, useSystemFonts: false }).promise;
  assert.ok(doc.numPages > 1);
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str;
      assert.ok(
        item.transform[4] >= 15 &&
          item.transform[4] + item.width <= page.view[2] - 15,
        `horizontal overflow: ${item.str}`
      );
    }
  }
  for (const value of [
    "基本契約書",
    "株式会社テスト",
    "田中花子",
    "a".repeat(64),
    ...signers.map((s) => s.Name)
  ])
    assert.ok(text.includes(value), value);
  await doc.destroy();
});
