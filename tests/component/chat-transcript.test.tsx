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

test("renders assistant markdown as real elements", () => {
  render(
    <ChatTranscript
      messages={[
        {
          role: "assistant",
          content: "Here is **bold** text\n\n- first\n- second",
        },
      ]}
    />,
  );
  // **bold** becomes a real <strong>, not the literal asterisks.
  const strong = screen.getByText("bold");
  expect(strong.tagName).toBe("STRONG");
  expect(screen.queryByText(/\*\*bold\*\*/)).not.toBeInTheDocument();
  // the "- " lines become real list items.
  expect(screen.getByText("first").closest("li")).not.toBeNull();
  expect(screen.getByText("second").closest("li")).not.toBeNull();
});

test("leaves user message markdown as literal text", () => {
  render(
    <ChatTranscript
      messages={[{ role: "user", content: "# not a heading" }]}
    />,
  );
  // The user's literal "# not a heading" is shown verbatim (no <h1>).
  const item = screen.getByTestId("chat-message");
  expect(item).toHaveTextContent("# not a heading");
  expect(item.querySelector("h1")).toBeNull();
});
