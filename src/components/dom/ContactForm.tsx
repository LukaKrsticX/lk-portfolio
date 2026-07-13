"use client";
import { useEffect, useRef, useState } from "react";
import { capture } from "@/lib/analytics";
import { site } from "@/content/site";

// Mirrors the server rule — comma/semicolon exclusion closes reply_to smuggling.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "inherit",
  font: "inherit",
};

type Status = "idle" | "sending" | "sent" | "failed";
type Errors = { name?: string; email?: string; message?: string };

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Errors>({});
  // Time-trap reference point; the server drops submissions under 2s.
  // Set in an effect (render must stay pure); null → server treats as bot.
  const mountedAt = useRef<number | null>(null);
  useEffect(() => {
    mountedAt.current ??= Date.now();
  }, []);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const baitRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = nameRef.current?.value.trim() ?? "";
    const email = emailRef.current?.value.trim() ?? "";
    const message = messageRef.current?.value.trim() ?? "";

    const nextErrors: Errors = {};
    if (!name) nextErrors.name = site.form.required;
    if (!email) nextErrors.email = site.form.required;
    else if (!EMAIL_RE.test(email)) nextErrors.email = site.form.invalidEmail;
    if (!message) nextErrors.message = site.form.required;
    setErrors(nextErrors);
    if (nextErrors.name) return nameRef.current?.focus();
    if (nextErrors.email) return emailRef.current?.focus();
    if (nextErrors.message) return messageRef.current?.focus();

    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          message,
          company_website: baitRef.current?.value ?? "",
          elapsedMs: mountedAt.current === null ? -1 : Date.now() - mountedAt.current,
        }),
      });
      if (res.ok) {
        setStatus("sent");
        capture("form_submit_ok");
        return;
      }
      setStatus("failed");
      const stage = res.status === 503 ? "unconfigured" : res.status === 429 ? "rate-limit" : "send";
      capture("form_submit_fail", { stage });
    } catch {
      setStatus("failed");
      capture("form_submit_fail", { stage: "network" });
    }
  }

  const sending = status === "sending";

  return (
    <form onSubmit={handleSubmit} noValidate style={{ maxWidth: 480 }}>
      <div style={{ marginTop: "1rem" }}>
        <label className="mono" htmlFor="cf-name" style={{ display: "block", marginBottom: 4 }}>
          {site.form.nameLabel}
        </label>
        <input
          ref={nameRef}
          id="cf-name"
          name="name"
          type="text"
          maxLength={200}
          style={fieldStyle}
          aria-describedby={errors.name ? "cf-name-err" : undefined}
          aria-invalid={errors.name ? true : undefined}
        />
        {errors.name && (
          <p id="cf-name-err" className="mono" style={{ marginTop: 4 }}>{errors.name}</p>
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label className="mono" htmlFor="cf-email" style={{ display: "block", marginBottom: 4 }}>
          {site.form.emailLabel}
        </label>
        <input
          ref={emailRef}
          id="cf-email"
          name="email"
          type="email"
          maxLength={320}
          style={fieldStyle}
          aria-describedby={errors.email ? "cf-email-err" : undefined}
          aria-invalid={errors.email ? true : undefined}
        />
        {errors.email && (
          <p id="cf-email-err" className="mono" style={{ marginTop: 4 }}>{errors.email}</p>
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label className="mono" htmlFor="cf-message" style={{ display: "block", marginBottom: 4 }}>
          {site.form.messageLabel}
        </label>
        <textarea
          ref={messageRef}
          id="cf-message"
          name="message"
          rows={5}
          maxLength={5000}
          style={{ ...fieldStyle, resize: "vertical" }}
          aria-describedby={errors.message ? "cf-message-err" : undefined}
          aria-invalid={errors.message ? true : undefined}
        />
        {errors.message && (
          <p id="cf-message-err" className="mono" style={{ marginTop: 4 }}>{errors.message}</p>
        )}
      </div>

      {/* Bait for form-filler bots; autofill skips one-time-code fields. */}
      <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}>
        <input
          ref={baitRef}
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="one-time-code"
        />
      </div>

      <button
        type="submit"
        disabled={sending}
        className="mono"
        style={{
          ...fieldStyle,
          width: "auto",
          cursor: sending ? "wait" : "pointer",
          marginTop: "1.5rem",
          padding: "10px 24px",
        }}
      >
        {sending ? site.form.sending : site.form.submitLabel}
      </button>

      <p role="status" className="mono" style={{ marginTop: 8, minHeight: "1.2em" }}>
        {status === "sent" ? site.form.success : status === "failed" ? site.form.failure : ""}
      </p>
      {status === "failed" && (
        <p style={{ marginTop: 4 }}>
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
        </p>
      )}
    </form>
  );
}
