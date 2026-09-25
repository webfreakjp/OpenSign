import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendNotifyMail,
  sendCompletedMail
} from "../../../OpenSignServer/cloud/parsefunction/pdf/PDF.js";
import sendSystemMail from "../../../OpenSignServer/cloud/parsefunction/sendSystemMail.js";
import sendMailWithAttachment from "../../../OpenSignServer/cloud/parsefunction/sendMailWithAttachment.js";

vi.mock("../../../OpenSignServer/Utils.js", () => ({
  cloudServerUrl: "https://example.test/app",
  serverAppId: "test",
  appName: "OpenSign"
}));
vi.mock("../../../OpenSignServer/utils/fileUtils.js", () => ({
  buildDownloadFilename: (_format, { docName }) => `${docName}.pdf`
}));
vi.mock(
  "../../../OpenSignServer/cloud/parsefunction/sendSystemMail.js",
  () => ({
    default: vi.fn()
  })
);
vi.mock(
  "../../../OpenSignServer/cloud/parsefunction/sendMailWithAttachment.js",
  () => ({ default: vi.fn() })
);

function makeDocument(preference, documentFlag = true) {
  return {
    objectId: "document",
    Name: "Test document",
    SignedUrl: "https://example.test/signed.pdf",
    NotifyOnSignatures: documentFlag,
    Placeholders: [{ Role: "Signer" }, { Role: "Signer" }],
    AuditTrail: [],
    ExtUserPtr: {
      objectId: "owner",
      Email: "owner@example.test",
      Name: "Owner",
      NotifyOnSignatures: preference
    },
    Signers: [{ Email: "signer@example.test" }]
  };
}

const signer = { Name: "Signer", Email: "signer@example.test" };
beforeEach(() => {
  vi.clearAllMocks();
  sendMailWithAttachment.mockResolvedValue({ status: "success" });
});

describe("signature progress notifications", () => {
  it("honors opting out after a document was created with notifications on", async () => {
    const doc = makeDocument(true);
    await sendNotifyMail(doc, signer, "smtp", "https://example.test");
    expect(sendSystemMail).toHaveBeenCalledTimes(1);

    // Each signing request includes the current owner profile from Parse.
    doc.ExtUserPtr.NotifyOnSignatures = false;
    await sendNotifyMail(doc, signer, "smtp", "https://example.test");
    expect(sendSystemMail).toHaveBeenCalledTimes(1);
  });

  it.each([true, undefined])(
    "sends intermediate notifications when the owner preference is %s",
    async (preference) => {
      await sendNotifyMail(
        makeDocument(preference),
        signer,
        "smtp",
        "https://example.test"
      );
      expect(sendSystemMail).toHaveBeenCalledOnce();
      expect(sendSystemMail.mock.calls[0][0].params.recipient).toBe(
        "owner@example.test"
      );
    }
  );

  it.each([false, undefined])(
    "does not enable a document whose notification flag is %s",
    async (documentFlag) => {
      const doc = makeDocument(true);
      doc.NotifyOnSignatures = documentFlag;
      await sendNotifyMail(doc, signer, "smtp", "https://example.test");
      expect(sendSystemMail).not.toHaveBeenCalled();
    }
  );

  it("does not send a progress email for the final signature", async () => {
    const doc = makeDocument(true);
    doc.AuditTrail = [{ Activity: "Signed" }];
    await sendNotifyMail(doc, signer, "smtp", "https://example.test");
    expect(sendSystemMail).not.toHaveBeenCalled();
  });

  it("still sends the completion email when progress notifications are off", async () => {
    await sendCompletedMail({
      doc: makeDocument(false, false),
      mailProvider: "smtp"
    });
    expect(sendMailWithAttachment).toHaveBeenCalledOnce();
    expect(sendMailWithAttachment.mock.calls[0][0].recipient).toBe(
      "signer@example.test,owner@example.test"
    );
  });
});
