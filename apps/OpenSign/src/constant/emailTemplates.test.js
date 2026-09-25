import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import serverAxios from "../../../OpenSignServer/node_modules/axios/index.js";
import { sendEmailToSigners } from "./Utils";
import createBatchDocs from "../../../OpenSignServer/cloud/parsefunction/createBatchDocs.js";

vi.mock("axios", () => ({ default: { post: vi.fn(), put: vi.fn() } }));
vi.mock("../../../OpenSignServer/node_modules/axios/index.js", () => ({
  default: { post: vi.fn() }
}));
vi.mock("./appinfo", () => ({ appInfo: {} }));
vi.mock("../i18n", () => ({ default: { t: (key) => key } }));
vi.mock("../utils", () => ({}));
vi.mock("../../../OpenSignServer/utils/CountUtils.js", () => ({
  setDocumentCount: vi.fn()
}));
vi.mock(
  "../../../OpenSignServer/cloud/parsefunction/sendSystemMail.js",
  () => ({
    default: vi.fn()
  })
);

const subject = "{{receiver_company}} / {{receiver_job_title}}";
const body =
  "<p>{{receiver_company}} {{receiver_job_title}} {{receiver_name}}</p>" +
  "<p>Sender: {{company_name}}</p><a href='{{signing_url}}'>Sign</a>";

function makeDocument(signers) {
  return {
    objectId: "document",
    Name: "Test document",
    createdAt: "2026-09-01T00:00:00Z",
    ExpiryDate: { iso: "2026-12-31T00:00:00Z" },
    CreatedBy: { objectId: "owner-user" },
    ExtUserPtr: {
      objectId: "owner",
      Name: "Sender",
      Email: "sender@example.test",
      Company: "Sender company",
      TenantId: { RequestSubject: subject, RequestBody: body }
    },
    Signers: signers,
    Placeholders: signers.map((signer) => ({
      signerObjId: signer.objectId,
      signerPtr: signer,
      email: signer.Email
    }))
  };
}

const signers = [
  {
    objectId: "first",
    Name: "First recipient",
    Email: "first@example.test",
    Company: "株式会社テスト $&",
    JobTitle: "取締役"
  },
  {
    objectId: "second",
    Name: "Second recipient",
    Email: "second@example.test",
    Company: "Second company",
    JobTitle: "Manager"
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("baseUrl", "https://example.test/api/app/");
  localStorage.setItem("parseAppId", "test");
  localStorage.setItem("accesstoken", "test");
  axios.post.mockResolvedValue({ data: { result: { status: "success" } } });
  axios.put.mockResolvedValue({});
  serverAxios.post.mockImplementation(async (url) => {
    if (url === "batch") {
      return {
        data: [
          {
            success: { objectId: "created", createdAt: "2026-09-01T00:00:00Z" }
          }
        ]
      };
    }
    return { data: { result: { status: "success" } } };
  });
  vi.stubGlobal("Parse", {
    Query: class {
      equalTo() {}
      async first() {
        return { id: "owner" };
      }
    }
  });
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("recipient company and job title in signing requests", () => {
  it.each([false, true])(
    "personalizes the subject and body for each recipient (customized: %s)",
    async (isCustomize) => {
      const doc = makeDocument(signers);
      const template = { subject, body };
      await sendEmailToSigners([doc], signers, template, template, isCustomize);

      expect(axios.post).toHaveBeenCalledTimes(2);
      signers.forEach((signer, index) => {
        const params = axios.post.mock.calls[index][1];
        expect(params.recipient).toBe(signer.Email);
        expect(params.subject).toBe(`${signer.Company} / ${signer.JobTitle}`);
        expect(params.html).toContain(
          `${signer.Company} ${signer.JobTitle} ${signer.Name}`
        );
        expect(params.html).toContain("Sender: Sender company");
        expect(params.html).not.toContain("{{receiver_");
      });
      expect(axios.put.mock.calls[0][1].RequestBody).toBe(body);
    }
  );

  it("uses blank values for missing contact details", async () => {
    const recipient = {
      objectId: "empty",
      Name: "Recipient",
      Email: "empty@example.test"
    };
    const doc = makeDocument([recipient]);
    await sendEmailToSigners(
      [doc],
      [recipient],
      null,
      { subject, body },
      false
    );

    const params = axios.post.mock.calls[0][1];
    expect(params.subject).toBe(" / ");
    expect(params.html).toContain("<p>  Recipient</p>");
    expect(params.html).not.toMatch(
      /undefined|\{\{receiver_(company|job_title)\}\}/
    );
  });

  it("only addresses the first recipient when sequential signing starts", async () => {
    const doc = { ...makeDocument(signers), SendinOrder: true };
    await sendEmailToSigners([doc], signers, null, { subject, body }, false);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][1].subject).toBe(
      "株式会社テスト $& / 取締役"
    );
  });

  it("keeps contact details in requests created by the batch endpoint", async () => {
    const doc = makeDocument(signers);
    // An email-only role can still refer to a registered contact.
    doc.Placeholders[1] = { email: signers[1].Email };
    doc.Placeholders.push({ email: "unregistered@example.test" });
    await createBatchDocs({
      user: { id: "owner-user" },
      headers: { origin: "https://example.test", sessiontoken: "test" },
      params: { Documents: JSON.stringify([doc]) }
    });

    await vi.waitFor(() => expect(serverAxios.post).toHaveBeenCalledTimes(4));
    const mails = serverAxios.post.mock.calls.slice(1).map((call) => call[1]);
    expect(mails.map((mail) => mail.subject)).toEqual([
      "株式会社テスト $& / 取締役",
      "Second company / Manager",
      " / "
    ]);
    expect(mails[1].html).toContain("Second company Manager Second recipient");
    expect(mails[2].html).not.toMatch(
      /undefined|\{\{receiver_(company|job_title)\}\}/
    );
  });
});
