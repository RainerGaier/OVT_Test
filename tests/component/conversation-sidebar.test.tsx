import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";

const convos = [
  { id: "1", title: "First chat" },
  { id: "2", title: "Second chat" },
];

test("lists conversations and fires onSelect", async () => {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(
    <ConversationSidebar
      conversations={convos}
      activeId="1"
      onSelect={onSelect}
      onNew={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  await user.click(screen.getByText("Second chat"));
  expect(onSelect).toHaveBeenCalledWith("2");
});

test("fires onNew and onDelete", async () => {
  const onNew = vi.fn();
  const onDelete = vi.fn();
  const user = userEvent.setup();
  render(
    <ConversationSidebar
      conversations={convos}
      activeId="1"
      onSelect={vi.fn()}
      onNew={onNew}
      onDelete={onDelete}
    />,
  );
  await user.click(screen.getByRole("button", { name: /new chat/i }));
  expect(onNew).toHaveBeenCalled();
  await user.click(screen.getAllByRole("button", { name: /delete/i })[0]);
  expect(onDelete).toHaveBeenCalledWith("1");
});

test("disables actions while streaming", async () => {
  const onNew = vi.fn();
  render(
    <ConversationSidebar
      conversations={convos}
      activeId="1"
      onSelect={vi.fn()}
      onNew={onNew}
      onDelete={vi.fn()}
      disabled={true}
    />,
  );
  expect(screen.getByRole("button", { name: /new chat/i })).toBeDisabled();
});
