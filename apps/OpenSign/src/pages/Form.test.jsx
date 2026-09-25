import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import Form from "./Form";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key })
}));
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }));
vi.mock("../constant/Utils", () => ({}));
vi.mock("../constant/saveFileSize", () => ({ SaveFileSize: vi.fn() }));
vi.mock("../utils", () => ({ withSessionValidation: (callback) => callback }));
vi.mock("../utils/acroFieldExtractor", () => ({
  clearAcroFields: vi.fn(),
  isPdfPasswordProtected: vi.fn()
}));
vi.mock("../components/shared/fields/SelectFolder", () => ({
  default: () => null
}));
vi.mock("../components/shared/fields/SignersInput", () => ({
  default: () => null
}));
vi.mock("../primitives/ModalUi", () => ({ default: () => null }));
vi.mock("react-tooltip", () => ({ Tooltip: () => null }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe.each([
  ["signature request", "8mZzFxbG1z"],
  ["template", "template"]
])("%s notification preference", (_title, route) => {
  it.each([false, true, undefined])(
    "keeps the saved preference (%s) after opening the creation form",
    (preference) => {
      localStorage.setItem(
        "Extand_Class",
        JSON.stringify([{ NotifyOnSignatures: preference }])
      );
      render(
        <MemoryRouter initialEntries={[`/form/${route}`]}>
          <Routes>
            <Route path="/form/:id" element={<Form />} />
          </Routes>
        </MemoryRouter>
      );
      fireEvent.click(screen.getByText("advanced-options"));
      const group = screen
        .getByText("notify-on-signatures")
        .closest("label").parentElement;
      const [on, off] = within(group).getAllByRole("radio");
      expect(on.checked).toBe(preference !== false);
      expect(off.checked).toBe(preference === false);

      // A deliberate document-level change must survive subsequent renders.
      fireEvent.click(preference === false ? on : off);
      fireEvent.click(screen.getByText("hide-advanced-options"));
      fireEvent.click(screen.getByText("advanced-options"));
      const updatedGroup = screen
        .getByText("notify-on-signatures")
        .closest("label").parentElement;
      const [updatedOn, updatedOff] =
        within(updatedGroup).getAllByRole("radio");
      expect(updatedOn.checked).toBe(preference === false);
      expect(updatedOff.checked).toBe(preference !== false);
    }
  );
});
