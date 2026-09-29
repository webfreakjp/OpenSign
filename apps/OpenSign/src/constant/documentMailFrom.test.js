// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough, Readable } from "node:stream";
import fs from "node:fs";
import addressparser from "../../../OpenSignServer/node_modules/nodemailer/lib/addressparser/index.js";
import { documentMailFrom } from "../../../OpenSignServer/cloud/parsefunction/documentMailFrom.js";
import sendMail from "../../../OpenSignServer/cloud/parsefunction/sendMailv3.js";
import sendMailWithAttachment from "../../../OpenSignServer/cloud/parsefunction/sendMailWithAttachment.js";

const mocks = vi.hoisted(() => ({
  smtp: true,
  smtpSend: vi.fn(),
  smtpClose: vi.fn(),
  mailgunSend: vi.fn(),
  first: vi.fn(),
  equalTo: vi.fn(),
  select: vi.fn(),
  updateMailCount: vi.fn()
}));

vi.mock("../../../OpenSignServer/Utils.js", () => ({
  get smtpenable() {
    return mocks.smtp;
  },
  smtpsecure: false,
  updateMailCount: mocks.updateMailCount
}));
vi.mock(
  "../../../OpenSignServer/node_modules/nodemailer/lib/nodemailer.js",
  () => ({
    createTransport: () => ({
      sendMail: mocks.smtpSend,
      close: mocks.smtpClose
    })
  })
);
vi.mock(
  "../../../OpenSignServer/node_modules/mailgun.js/ESM/mailgun.node.js",
  () => ({
    default: class {
      client() {
        return { messages: { create: mocks.mailgunSend } };
      }
    }
  })
);
vi.mock("node:fs", () => ({
  default: {
    createWriteStream: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn()
  }
}));
vi.mock("../../../OpenSignServer/node_modules/axios/index.js", () => ({
  default: {
    get: async () => ({ data: Readable.from([Buffer.from("%PDF-test")]) })
  }
}));

const address = "delivery@example.test";
const params = {
  extUserId: "document-owner",
  from: "田中花子",
  recipient: "recipient@example.test",
  replyto: "sender@example.test",
  subject: "署名のご案内",
  html: "<p>調整済みのテンプレート</p>",
  cc: ["cc@example.test"],
  bcc: ["bcc@example.test"]
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.smtp = true;
  mocks.smtpSend.mockResolvedValue({ response: "queued" });
  mocks.mailgunSend.mockResolvedValue({ status: 200 });
  mocks.first.mockResolvedValue({ get: () => "株式会社テスト" });
  vi.stubGlobal("Parse", {
    Query: class {
      equalTo = mocks.equalTo;
      select = mocks.select;
      first = mocks.first;
    }
  });
  vi.stubEnv("SMTP_USER_EMAIL", address);
  vi.stubEnv("MAILGUN_SENDER", address);
  vi.stubEnv("MAILGUN_API_KEY", "test-key");
  vi.stubEnv("MAILGUN_DOMAIN", "example.test");
  vi.stubEnv("EMAIL_REPORT_FOOTER_ENABLED", "false");
  vi.spyOn(console, "log").mockImplementation(() => {});
  fs.createWriteStream.mockImplementation((path) => {
    const stream = new PassThrough();
    stream.path = path;
    return stream;
  });
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue(Buffer.from("%PDF-test"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(["SMTP", "Mailgun"])("document From via %s", (provider) => {
  it.each([
    "request",
    "completion without attachment",
    "completion with attachment"
  ])(
    "adds the owner's company to %s and preserves the message",
    async (flow) => {
      mocks.smtp = provider === "SMTP";
      const mailParams = { ...params };
      if (flow === "completion with attachment") {
        mailParams.url = "http://localhost/signed.pdf";
        mailParams.pdfName = "契約書";
        mailParams.certificatePath = "./test-certificate.pdf";
      }
      const result =
        flow === "request"
          ? await sendMail({ params: mailParams })
          : await sendMailWithAttachment(mailParams);

      expect(result).toEqual({ status: "success" });
      const message = mocks.smtp
        ? mocks.smtpSend.mock.calls[0][0]
        : mocks.mailgunSend.mock.calls[0][1];
      expect(addressparser(message.from)).toEqual([
        { name: "株式会社テスト 田中花子", address }
      ]);
      expect(message).toMatchObject({
        to: params.recipient,
        replyTo: params.replyto,
        subject: params.subject,
        html: params.html,
        cc: params.cc,
        bcc: params.bcc
      });
      expect(mocks.equalTo).toHaveBeenCalledWith("objectId", "document-owner");
      expect(mocks.select).toHaveBeenCalledWith(["Company"]);
      expect(mocks.updateMailCount).toHaveBeenCalledWith("document-owner");
      if (flow === "completion with attachment") {
        const attachments = mocks.smtp
          ? message.attachments
          : message.attachment;
        expect(attachments.map((file) => file.filename)).toEqual([
          "契約書.pdf",
          "certificate.pdf"
        ]);
        for (const file of attachments) {
          expect(mocks.smtp ? file.content : file.data).toEqual(
            Buffer.from("%PDF-test")
          );
        }
      }
    }
  );
});

describe("sender company fallback and header formatting", () => {
  it.each([undefined, null, "", "  \t\r\n "])(
    "keeps the selected name when the company is %j",
    async (company) => {
      mocks.first.mockResolvedValue({ get: () => company });
      const from = await documentMailFrom("田中花子", address, "owner");
      expect(addressparser(from)).toEqual([{ name: "田中花子", address }]);
    }
  );

  it("keeps sending if the owner is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.first.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await sendMail({ params })).toEqual({ status: "success" });
    expect(addressparser(mocks.smtpSend.mock.calls[0][0].from)).toEqual([
      { name: "田中花子", address }
    ]);
    mocks.first.mockResolvedValueOnce(undefined);
    expect(
      addressparser(await documentMailFrom("田中花子", address, "missing"))
    ).toEqual([{ name: "田中花子", address }]);
  });

  it("keeps an explicit name or email display name without replacing it", async () => {
    for (const name of ["契約担当", "sender@example.test", "OpenSign"]) {
      expect(
        addressparser(await documentMailFrom(name, address, "owner"))
      ).toEqual([{ name: `株式会社テスト ${name}`, address }]);
    }
  });

  it("does not query a profile when no owner was supplied", async () => {
    const from = await documentMailFrom("Sender", address);
    expect(addressparser(from)).toEqual([{ name: "Sender", address }]);
    expect(await documentMailFrom("", address)).toBe(address);
    expect(mocks.first).not.toHaveBeenCalled();
  });

  it("keeps punctuation and newlines inside one display name", async () => {
    mocks.first.mockResolvedValue({
      get: () => 'Example, "West" \\ Co. <office>'
    });
    const from = await documentMailFrom("Jane\r\nDoe", address, "owner");
    expect(addressparser(from)).toEqual([
      { name: 'Example, "West" \\ Co. <office> Jane Doe', address }
    ]);
    expect(from).not.toMatch(/[\r\n]/);
  });
});
