import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import addSignaturePlaceholder from "../apps/OpenSignServer/cloud/parsefunction/pdf/addSignaturePlaceholder.js";

const require = createRequire(
  new URL("../apps/OpenSignServer/package.json", import.meta.url)
);
const { PDFDocument, PDFDict, PDFName } = require("pdf-lib");

const cases = [
  {
    title: "Unset identity retains the upstream PDF metadata",
    name: undefined,
    contact: undefined,
    expectedName: "OpenSign",
    expectedContact: "hello@opensignlabs.com"
  },
  {
    title:
      "Empty or whitespace-only identity retains the upstream PDF metadata",
    name: " \t ",
    contact: "",
    expectedName: "OpenSign",
    expectedContact: "hello@opensignlabs.com"
  },
  {
    title: "Japanese identity and PDF delimiters survive PDF serialization",
    name: "  株式会社テスト (契約部) \\ 管理窓口  ",
    contact: "  総務部 <contracts@example.test>  ",
    expectedName: "株式会社テスト (契約部) \\ 管理窓口",
    expectedContact: "総務部 <contracts@example.test>"
  },
  {
    title: "The name can be configured independently of the contact",
    name: "Example Company",
    contact: undefined,
    expectedName: "Example Company",
    expectedContact: "hello@opensignlabs.com"
  },
  {
    title: "The contact can be configured independently of the name",
    name: undefined,
    contact: "contracts@example.test",
    expectedName: "OpenSign",
    expectedContact: "contracts@example.test"
  }
];

for (const scenario of cases) {
  test(scenario.title, async (t) => {
    for (const [key, value] of Object.entries({
      PDF_SIGNER_NAME: scenario.name,
      PDF_SIGNER_CONTACT: scenario.contact
    })) {
      const original = process.env[key];
      t.after(() => {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
      });
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    // Contract PDFs include the recipients; completion certificates omit them.
    for (const signedFor of ["山田太郎 (署名者)", undefined]) {
      const pdf = await PDFDocument.create();
      pdf.addPage();
      addSignaturePlaceholder(pdf, signedFor);
      const reloaded = await PDFDocument.load(await pdf.save());
      const signatures = reloaded.context
        .enumerateIndirectObjects()
        .map(([, object]) => object)
        .filter(
          (object) =>
            object instanceof PDFDict &&
            object.get(PDFName.of("Type"))?.toString() === "/Sig"
        );
      assert.equal(signatures.length, 1);
      const field = (key) => signatures[0].get(PDFName.of(key)).decodeText();
      assert.equal(field("Name"), scenario.expectedName);
      assert.equal(field("ContactInfo"), scenario.expectedContact);
      assert.equal(
        field("Reason"),
        signedFor === undefined
          ? `Digitally signed by ${scenario.expectedName}.`
          : `Digitally signed by ${scenario.expectedName} for ${signedFor}`
      );
    }
  });
}
