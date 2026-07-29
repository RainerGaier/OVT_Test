import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ChatTranscript } from "@/components/chat/chat-transcript";

test("renders user and assistant messages in order", () => {
  render(
    <ChatTranscript
      messages={[
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ]}
    />,
  );
  const items = screen.getAllByTestId("chat-message");
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent("hello");
  expect(items[1]).toHaveTextContent("hi there");
});

test("shows an empty-state hint when there are no messages", () => {
  render(<ChatTranscript messages={[]} />);
  expect(screen.getByText(/start the conversation/i)).toBeInTheDocument();
});
