import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TodoForm } from "./TodoForm";

// One example test so students see the pattern. Copy this file when you
// build your own components.
describe("TodoForm", () => {
  it("calls onAdd with the text and clears the input", () => {
    const onAdd = vi.fn();
    render(<TodoForm onAdd={onAdd} />);

    const input = screen.getByPlaceholderText("What needs doing?") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "buy milk" } });
    fireEvent.click(screen.getByText("Add"));

    expect(onAdd).toHaveBeenCalledWith("buy milk");
    expect(input.value).toBe("");
  });

  it("ignores empty submissions", () => {
    const onAdd = vi.fn();
    render(<TodoForm onAdd={onAdd} />);

    fireEvent.click(screen.getByText("Add"));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
