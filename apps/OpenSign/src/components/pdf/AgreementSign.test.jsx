import React, { StrictMode, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgreementSign from "./AgreementSign";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key })
}));
vi.mock("../../constant/Utils", () => ({
  getEnv: () => window.RUNTIME_ENV || {}
}));

afterEach(() => {
  cleanup();
  delete window.RUNTIME_ENV;
});

function SigningScreen({ onStart }) {
  const [hasStarted, setHasStarted] = useState(false);
  return hasStarted ? (
    <p>Signing screen ready</p>
  ) : (
    <AgreementSign
      onContinue={() => {
        onStart();
        setHasStarted(true);
      }}
    />
  );
}

describe("recipient signing disclosure", () => {
  it.each([undefined, "", "true", "invalid"])(
    "waits for explicit consent when the setting is %s",
    (setting) => {
      window.RUNTIME_ENV = { REACT_APP_SIGNING_CONSENT_ENABLED: setting };
      const onStart = vi.fn();
      render(<SigningScreen onStart={onStart} />);

      expect(
        screen.getByRole("button", { name: "agrre-button" })
      ).toBeInTheDocument();
      expect(onStart).not.toHaveBeenCalled();
      expect(
        screen.queryByText("Signing screen ready")
      ).not.toBeInTheDocument();
    }
  );

  it("starts signing once without showing either disclosure when disabled", () => {
    window.RUNTIME_ENV = { REACT_APP_SIGNING_CONSENT_ENABLED: "false" };
    const onStart = vi.fn();
    render(
      <StrictMode>
        <SigningScreen onStart={onStart} />
      </StrictMode>
    );

    expect(screen.getByText("Signing screen ready")).toBeInTheDocument();
    expect(screen.queryByText("agree-p2")).not.toBeInTheDocument();
    expect(screen.queryByText("term-cond-title")).not.toBeInTheDocument();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("starts signing after the consent button is clicked", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<SigningScreen onStart={onStart} />);

    await user.click(screen.getByRole("button", { name: "agrre-button" }));

    expect(screen.getByText("Signing screen ready")).toBeInTheDocument();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("allows reading and closing the disclosure without starting signing", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<SigningScreen onStart={onStart} />);

    await user.click(screen.getByText("agree-p2"));
    expect(screen.getByText("term-cond-title")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "close", hidden: true })
    );

    expect(screen.queryByText("term-cond-title")).not.toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "agrre-button" })
    ).toBeInTheDocument();
  });

  it("starts signing after consent in the full disclosure", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<SigningScreen onStart={onStart} />);

    await user.click(screen.getByText("agree-p2"));
    const buttons = screen.getAllByRole("button", {
      name: "agrre-button",
      hidden: true
    });
    await user.click(buttons[1]);

    expect(screen.getByText("Signing screen ready")).toBeInTheDocument();
    expect(screen.queryByText("term-cond-title")).not.toBeInTheDocument();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
