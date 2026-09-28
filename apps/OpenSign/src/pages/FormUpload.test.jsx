import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { PDFDocument } from "pdf-lib";
import Form from "./Form";

const uploads = vi.hoisted(() => ({ files: [], save: vi.fn() }));
vi.mock("parse", () => ({
  default: {
    File: class {
      constructor(name, data) {
        this.data = data;
        uploads.files.push(this);
      }
      async save() {
        uploads.save();
        return this;
      }
      url() {
        return "https://example.test/document.pdf";
      }
    }
  }
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key })
}));
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }));
vi.mock("../utils", () => ({ withSessionValidation: (callback) => callback }));
vi.mock("../constant/saveFileSize", () => ({ SaveFileSize: vi.fn() }));
vi.mock("../constant/Utils", () => ({
  generatePdfName: () => "upload",
  generateTitleFromFilename: () => "Test document",
  getSecureUrl: async (url) => ({ url }),
  getFileAsArrayBuffer: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    })
}));
vi.mock("../components/shared/fields/SelectFolder", () => ({
  default: () => null
}));
vi.mock("../components/shared/fields/SignersInput", () => ({
  default: () => null
}));
vi.mock("react-tooltip", () => ({ Tooltip: () => null }));

beforeEach(() => {
  localStorage.clear();
  uploads.files.length = 0;
  uploads.save.mockClear();
  vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openForm() {
  const { container } = render(
    <MemoryRouter initialEntries={["/form/8mZzFxbG1z"]}>
      <Routes>
        <Route path="/form/:id" element={<Form />} />
      </Routes>
    </MemoryRouter>
  );
  return container.querySelector('input[type="file"]');
}

it("uploads and preserves both pages of an ordinary PDF without conversion services", async () => {
  const original = await PDFDocument.create();
  original.addPage([300, 400]);
  original.addPage([500, 600]);
  const file = new File([await original.save()], "document.pdf", {
    type: "application/pdf"
  });
  fireEvent.change(openForm(), { target: { files: [file] } });
  await screen.findByDisplayValue("Test document");
  expect(uploads.save).toHaveBeenCalledOnce();
  const uploaded = await PDFDocument.load(
    new Uint8Array(uploads.files[0].data)
  );
  expect(uploaded.getPages().map((page) => page.getSize())).toEqual([
    { width: 300, height: 400 },
    { width: 500, height: 600 }
  ]);
  expect(window.alert).not.toHaveBeenCalled();
});

it("rejects a selection containing DOCX before uploading any file", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const files = [
    new File([await pdf.save()], "document.pdf", { type: "application/pdf" }),
    new File(["unsupported"], "document.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    })
  ];
  fireEvent.change(openForm(), { target: { files } });
  expect(window.alert).toHaveBeenCalledWith("supported-upload-files");
  expect(uploads.files).toHaveLength(0);
});

it("rejects PDFs marked as encrypted without prompting for a password or uploading", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.context.trailerInfo.Encrypt = pdf.context.register(
    pdf.context.obj({ Filter: "Standard" })
  );
  const file = new File([await pdf.save()], "encrypted.pdf", {
    type: "application/pdf"
  });
  const prompt = vi.spyOn(window, "prompt");
  fireEvent.change(openForm(), { target: { files: [file] } });
  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith("encrypted-pdf-unsupported")
  );
  expect(uploads.files).toHaveLength(0);
  expect(prompt).not.toHaveBeenCalled();
});
