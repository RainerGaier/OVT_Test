import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MessageComposer } from "@/components/chat/message-composer";

test("submits the typed message and clears the field", async () => {
  const onSend = vi.fn();
  const user = userEvent.setup();
  render(<MessageComposer onSend={onSend} disabled={false} />);
  const box = screen.getByRole("textbox");
  await user.type(box, "hello");
  await user.click(screen.getByRole("button", { name: /send/i }));
  expect(onSend).toHaveBeenCalledWith("hello");
  expect(box).toHaveValue("");
});

test("does not send while disabled", async () => {
  const onSend = vi.fn();
  render(<MessageComposer onSend={onSend} disabled={true} />);
  expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
});
