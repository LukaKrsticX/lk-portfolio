import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { site } from "@/content/site";

const captureMock = vi.fn();
vi.mock("@/lib/analytics", () => ({ capture: (...args: unknown[]) => captureMock(...args) }));

import { ContactForm } from "./ContactForm";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  captureMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(site.form.nameLabel), {
    target: { value: "Jane Doe" },
  });
  fireEvent.change(screen.getByLabelText(site.form.emailLabel), {
    target: { value: "jane@agency.co" },
  });
  fireEvent.change(screen.getByLabelText(site.form.messageLabel), {
    target: { value: "We need a rescue for a client site." },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: site.form.submitLabel }));
}

describe("ContactForm", () => {
  it("shows inline required errors and moves focus to the first invalid field", () => {
    render(<ContactForm />);
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    const nameInput = screen.getByLabelText(site.form.nameLabel);
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAccessibleDescription(site.form.required);
  });

  it("rejects an invalid email inline (comma-smuggling included)", () => {
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(site.form.nameLabel), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(site.form.emailLabel), {
      target: { value: "a@b.co,evil@d.e" },
    });
    fireEvent.change(screen.getByLabelText(site.form.messageLabel), {
      target: { value: "A long enough message here." },
    });
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(site.form.emailLabel)).toHaveAccessibleDescription(
      site.form.invalidEmail,
    );
  });

  it("rejects a too-short message inline (mirrors the server 10-char minimum)", () => {
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(site.form.nameLabel), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(site.form.emailLabel), {
      target: { value: "jane@agency.co" },
    });
    fireEvent.change(screen.getByLabelText(site.form.messageLabel), {
      target: { value: "Call me" },
    });
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(site.form.messageLabel)).toHaveAccessibleDescription(
      site.form.messageMin,
    );
  });

  it("maps a server 400 to form_submit_fail {stage: validation}", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, errors: { message: "length" } }), { status: 400 }),
    );
    render(<ContactForm />);
    fillValidForm();
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.failure));
    expect(captureMock).toHaveBeenCalledWith("form_submit_fail", { stage: "validation" });
  });

  it("announces Sending… in the status region while pending", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((res) => (release = res)));
    render(<ContactForm />);
    fillValidForm();
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.sending));
    release(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.success));
  });

  it("happy path: posts JSON incl. elapsedMs + honeypot, announces success, fires form_submit_ok", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<ContactForm />);
    fillValidForm();
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.success));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/contact");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("Jane Doe");
    expect(body.email).toBe("jane@agency.co");
    expect(typeof body.elapsedMs).toBe("number");
    expect(body.company_website).toBe("");
    expect(captureMock).toHaveBeenCalledWith("form_submit_ok");
  });

  it("503 unconfigured: failed state with mailto fallback, fires form_submit_fail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, reason: "unconfigured" }), { status: 503 }),
    );
    render(<ContactForm />);
    fillValidForm();
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.failure));
    expect(screen.getByRole("link", { name: site.contact.email })).toHaveAttribute(
      "href",
      `mailto:${site.contact.email}`,
    );
    expect(captureMock).toHaveBeenCalledWith("form_submit_fail", { stage: "unconfigured" });
  });

  it("network failure: failed state + form_submit_fail {stage: network}", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<ContactForm />);
    fillValidForm();
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.failure));
    expect(captureMock).toHaveBeenCalledWith("form_submit_fail", { stage: "network" });
  });

  it("disables the button while sending", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((res) => (release = res)));
    render(<ContactForm />);
    fillValidForm();
    submit();
    expect(await screen.findByRole("button", { name: site.form.sending })).toBeDisabled();
    // A mid-flight edit must NOT re-arm the form (only 'sent' re-arms) —
    // kills the unconditional setStatus("idle") mutant.
    fireEvent.change(screen.getByLabelText(site.form.messageLabel), {
      target: { value: "Edited while the request is in flight." },
    });
    expect(screen.getByRole("button", { name: site.form.sending })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(site.form.sending);
    release(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.success));
  });

  it("honeypot field is hidden from the accessibility tree and tab order", () => {
    const { container } = render(<ContactForm />);
    const bait = container.querySelector('input[name="company_website"]') as HTMLInputElement;
    expect(bait).not.toBeNull();
    expect(bait.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(bait.tabIndex).toBe(-1);
    expect(bait.autocomplete).toBe("one-time-code");
  });

  it("keeps a persistent status region in the DOM from mount", () => {
    render(<ContactForm />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("keeps the failure state and mailto fallback while the user edits to retry", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<ContactForm />);
    fillValidForm();
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.failure));
    fireEvent.change(screen.getByLabelText(site.form.messageLabel), {
      target: { value: "Editing my message before retrying the send." },
    });
    expect(screen.getByRole("status")).toHaveTextContent(site.form.failure);
    expect(screen.getByRole("link", { name: site.contact.email })).toBeInTheDocument();
  });

  it("blocks duplicate sends: button stays disabled after success until a field is edited", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    render(<ContactForm />);
    fillValidForm();
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(site.form.success));
    const button = screen.getByRole("button", { name: site.form.submitLabel });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(site.form.messageLabel), {
      target: { value: "Actually, one more detail about the project." },
    });
    expect(button).toBeEnabled();
    expect(screen.getByRole("status")).not.toHaveTextContent(site.form.success);
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
