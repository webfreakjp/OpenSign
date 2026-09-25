import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import Parse from "parse";
import getDocument from "../../../OpenSignServer/cloud/parsefunction/getDocument.js";
import GuestLogin from "./GuestLogin";

vi.mock("parse", () => ({ default: { Cloud: { run: vi.fn() } } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key, i18n: {} })
}));
vi.mock("../constant/Utils", () => ({
  contractUsers: vi.fn(),
  saveLanguageInLocal: vi.fn()
}));
vi.mock("../constant/appinfo", () => ({
  appInfo: { appId: "test", baseUrl: "https://example.test/app" }
}));
vi.mock("../../../OpenSignServer/Utils.js", () => ({
  cloudServerUrl: "https://example.test/app",
  serverAppId: "test"
}));
vi.mock("../components/pdf/SelectLanguage", () => ({ default: () => null }));
vi.mock("../primitives/ModalUi", () => ({
  default: ({ isOpen, children }) =>
    isOpen ? <div role="dialog">{children}</div> : null
}));

let storedDocument;
let documentFailure;
let needsDetails;
const otpRequests = () =>
  Parse.Cloud.run.mock.calls.filter(([name]) => name === "SendOTPMailV1");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  documentFailure = false;
  needsDetails = false;
  storedDocument = {
    objectId: "document",
    IsEnableOTP: false,
    ExtUserPtr: { TenantId: {} }
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("Parse", {
    Query: class {
      equalTo() {}
      include() {}
      notEqualTo() {}
      async first() {
        if (!storedDocument) return undefined;
        return {
          get: (key) => storedDocument[key],
          toJSON: () => JSON.parse(JSON.stringify(storedDocument))
        };
      }
    }
  });
  Parse.Cloud.run.mockImplementation(async (name, params) => {
    if (name === "getDocument") {
      if (documentFailure) throw new Error("Connection interrupted");
      // Exercise the actual server decision and the guest screen together.
      return getDocument({ params, headers: {} });
    }
    if (name === "linkcontacttodoc") {
      if (needsDetails && !params.name)
        throw new Error("Recipient details required");
      return { contactId: "contact" };
    }
    if (name === "SendOTPMailV1") return "Otp send";
    throw new Error(`Unexpected cloud function: ${name}`);
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function openInvitation(withContact = true) {
  const link = btoa(
    `document/recipient@example.test${withContact ? "/contact" : ""}`
  );
  return render(
    <MemoryRouter initialEntries={[`/login/${link}`]}>
      <Routes>
        <Route path="/login/:base64url" element={<GuestLogin />} />
        <Route
          path="/load/recipientSignPdf/:docId/:contactId"
          element={<p>Document ready</p>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("external recipient OTP", () => {
  it("opens an OTP-disabled invitation without sending a code", async () => {
    openInvitation();
    await screen.findByText("Document ready");
    expect(otpRequests()).toHaveLength(0);
  });

  it("keeps the OTP step for a protected document and sends only when requested", async () => {
    storedDocument.IsEnableOTP = true;
    openInvitation();
    const sendCode = await screen.findByRole("button", {
      name: "get-verification-code"
    });
    expect(screen.queryByText("Document ready")).not.toBeInTheDocument();
    expect(otpRequests()).toHaveLength(0);
    fireEvent.click(sendCode);
    await screen.findByRole("dialog");
    expect(otpRequests()).toHaveLength(1);
  });

  it("does not offer OTP for a missing or archived document", async () => {
    storedDocument = null;
    openInvitation();
    await screen.findByText("document-deleted");
    expect(
      screen.queryByRole("button", { name: "get-verification-code" })
    ).not.toBeInTheDocument();
    expect(otpRequests()).toHaveLength(0);
  });

  it("reports connection failures without offering OTP", async () => {
    documentFailure = true;
    openInvitation();
    await screen.findByText("something-went-wrong-mssg");
    expect(
      screen.queryByRole("button", { name: "get-verification-code" })
    ).not.toBeInTheDocument();
    expect(otpRequests()).toHaveLength(0);
  });

  it.each([false, true, "missing", "connection-error"])(
    "requests OTP after recipient details only when required (%s)",
    async (mode) => {
      needsDetails = true;
      if (mode === "missing") storedDocument = null;
      else if (mode === "connection-error") documentFailure = true;
      else storedDocument.IsEnableOTP = mode;
      openInvitation(false);
      fireEvent.change(await screen.findByPlaceholderText("enter-name"), {
        target: { value: "Recipient" }
      });
      fireEvent.click(screen.getByRole("button", { name: "next" }));

      if (mode === true) {
        await screen.findByRole("dialog");
      } else if (mode === false) {
        await screen.findByText("Document ready");
      } else {
        await screen.findByText(
          mode === "missing" ? "document-deleted" : "something-went-wrong-mssg"
        );
        expect(
          screen.queryByRole("button", { name: "get-verification-code" })
        ).not.toBeInTheDocument();
      }
      await waitFor(() =>
        expect(otpRequests()).toHaveLength(mode === true ? 1 : 0)
      );
    }
  );
});
