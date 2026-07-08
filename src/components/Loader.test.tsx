import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
