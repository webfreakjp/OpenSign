import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import Parse from "parse";
import HomeLayout from "./HomeLayout";

vi.mock("axios", () => ({ default: { put: vi.fn() } }));
vi.mock("parse", () => ({
  default: {
    User: { current: () => ({ id: "user" }) },
    Query: class {
      async get() {
        return { get: () => "" };
      }
    },
    Cloud: { run: vi.fn() }
  }
}));
vi.mock("react-redux", () => {
  const state = {
    TourSteps: [{ selector: "body", content: "Home" }],
    user: { isValidSession: true }
  };
  const dispatch = vi.fn();
  return {
    useSelector: (selector) => selector(state),
    useDispatch: () => dispatch
  };
});
vi.mock("react-i18next", () => {
  const i18n = { changeLanguage: vi.fn() };
  return { useTranslation: () => ({ t: (key) => key, i18n }) };
});
vi.mock("react-router", () => ({ Outlet: () => <p>Home ready</p> }));
vi.mock("../constant/Utils", () => ({ nonPresentMaskCss: {} }));
vi.mock("../components/Header", () => ({ default: () => null }));
vi.mock("../components/Footer", () => ({ default: () => null }));
vi.mock("../components/sidebar/Sidebar", () => ({ default: () => null }));
vi.mock("../primitives/SessionExpiredModal", () => ({ default: () => null }));
vi.mock("../primitives/Tour", () => ({
  default: ({ onRequestClose }) => (
    <button onClick={onRequestClose}>Close tour</button>
  )
}));

let profile;
beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  profile = {
    objectId: "profile",
    TourStatus: [{ loginTour: false }, { driveTour: true }]
  };
  localStorage.setItem("Extand_Class", JSON.stringify([profile]));
  localStorage.setItem("baseUrl", "https://example.test/app/");
  localStorage.setItem("parseAppId", "test");
  localStorage.setItem("accesstoken", "user-session");
  localStorage.setItem("TenantId", "tenant");
  Parse.Cloud.run.mockImplementation(async () =>
    JSON.parse(JSON.stringify(profile))
  );

  const { default: sdk } = await vi.importActual("parse");
  const acl = new sdk.ACL();
  acl.setReadAccess("user", true);
  acl.setWriteAccess("user", true);
  axios.put.mockImplementation(async (_url, body, { headers }) => {
    const canWrite =
      headers["X-Parse-Session-Token"] === "user-session" &&
      acl.getWriteAccess("user");
    if (!canWrite) throw new Error("Write access denied");
    expect(body.TourStatus.__op).toBe("AddUnique");
    for (const completed of body.TourStatus.objects) {
      if (
        !profile.TourStatus.some(
          (tour) => JSON.stringify(tour) === JSON.stringify(completed)
        )
      ) {
        profile.TourStatus.push(completed);
      }
    }
    return { data: { updatedAt: "2026-01-01T00:00:00Z" } };
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("home tour persistence", () => {
  it("saves for an ACL-protected user and stays closed after remounting", async () => {
    const page = render(<HomeLayout />);
    fireEvent.click(await screen.findByRole("button", { name: "Close tour" }));
    await waitFor(() =>
      expect(profile.TourStatus).toContainEqual({ loginTour: true })
    );
    expect(profile.TourStatus).toContainEqual({ driveTour: true });
    expect(axios.put).toHaveBeenCalledWith(
      "https://example.test/app/classes/contracts_Users/profile",
      expect.anything(),
      {
        headers: {
          "X-Parse-Application-Id": "test",
          "X-Parse-Session-Token": "user-session"
        }
      }
    );

    page.unmount();
    render(<HomeLayout />);
    await screen.findByText("Home ready");
    await waitFor(() => expect(Parse.Cloud.run).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("button", { name: "Close tour" })
    ).not.toBeInTheDocument();
  });

  it("reports a failed save and allows retrying without marking it saved early", async () => {
    axios.put.mockRejectedValueOnce(new Error("Connection interrupted"));
    render(<HomeLayout />);
    fireEvent.click(await screen.findByRole("button", { name: "Close tour" }));
    await screen.findByText("tour-save-error");
    expect(profile.TourStatus).not.toContainEqual({ loginTour: true });
    expect(
      JSON.parse(localStorage.getItem("Extand_Class"))[0].TourStatus
    ).not.toContainEqual({ loginTour: true });

    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() =>
      expect(profile.TourStatus).toContainEqual({ loginTour: true })
    );
    expect(screen.queryByText("tour-save-error")).not.toBeInTheDocument();
    expect(axios.put).toHaveBeenCalledTimes(2);
  });
});
