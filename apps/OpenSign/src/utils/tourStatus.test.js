import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { markTourCompleted } from "./tourStatus";

vi.mock("axios", () => ({ default: { put: vi.fn() } }));

let saved;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  saved = [{ loginTour: false }, { requestSign: true }];
  localStorage.setItem(
    "Extand_Class",
    JSON.stringify([{ objectId: "profile", TourStatus: [] }])
  );
  localStorage.setItem("baseUrl", "https://example.test/app/");
  localStorage.setItem("parseAppId", "test");
  localStorage.setItem("accesstoken", "session");
  axios.put.mockImplementation(async (_url, body, { headers }) => {
    expect(headers["X-Parse-Session-Token"]).toBe("session");
    expect(body.TourStatus.__op).toBe("AddUnique");
    // Parse Server maps AddUnique to MongoDB's $addToSet, which compares values.
    for (const completed of body.TourStatus.objects) {
      if (
        !saved.some(
          (tour) => JSON.stringify(tour) === JSON.stringify(completed)
        )
      ) {
        saved.push(completed);
      }
    }
    return { data: {} };
  });
});
afterEach(() => localStorage.clear());

describe("saving completed tours", () => {
  it("preserves other saved tours across concurrent and repeated dismissals", async () => {
    await Promise.all([
      markTourCompleted("loginTour"),
      markTourCompleted("templateReport")
    ]);
    await markTourCompleted("loginTour");
    expect(saved).toContainEqual({ requestSign: true });
    expect(saved).toContainEqual({ templateReport: true });
    expect(saved.filter((tour) => tour.loginTour === true)).toHaveLength(1);
    const cached = JSON.parse(localStorage.getItem("Extand_Class"))[0]
      .TourStatus;
    expect(cached).toContainEqual({ loginTour: true });
    expect(cached).toContainEqual({ templateReport: true });
  });

  it("updates a contact's tour without changing the logged-in profile", async () => {
    const cachedProfile = localStorage.getItem("Extand_Class");
    await markTourCompleted("requestSign", {
      className: "contracts_Contactbook",
      objectId: "contact"
    });
    expect(axios.put.mock.calls[0][0]).toBe(
      "https://example.test/app/classes/contracts_Contactbook/contact"
    );
    expect(localStorage.getItem("Extand_Class")).toBe(cachedProfile);
  });

  it("does not update a different account's cache after the session changes", async () => {
    axios.put.mockImplementationOnce(async () => {
      localStorage.setItem(
        "Extand_Class",
        JSON.stringify([{ objectId: "another-profile" }])
      );
    });
    await markTourCompleted("loginTour");
    expect(JSON.parse(localStorage.getItem("Extand_Class"))).toEqual([
      { objectId: "another-profile" }
    ]);
  });

  it("refuses an anonymous save", async () => {
    localStorage.removeItem("accesstoken");
    await expect(markTourCompleted("loginTour")).rejects.toThrow(
      "signed-in profile"
    );
    expect(axios.put).not.toHaveBeenCalled();
  });
});
