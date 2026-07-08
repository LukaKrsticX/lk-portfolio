import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState } from "react";
import { Loader } from "./Loader";

describe("Loader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls onDone within the 1.5s cap", () => {
    const onDone = vi.fn();
    render(<Loader onDone={onDone} />);
    act(() => vi.advanceTimersByTime(1600));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skip button fires onDone immediately", () => {
    const onDone = vi.fn();
    render(<Loader onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("StrictMode: completes once, no setState-in-render warning (ledger)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onDone = vi.fn();
    function Host() {
      const [booted, setBooted] = useState(false);
      if (booted) return <p>booted</p>;
      return (
        <Loader
          onDone={() => {
            onDone();
            setBooted(true);
          }}
        />
      );
    }
    render(
      <StrictMode>
        <Host />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(1600));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
