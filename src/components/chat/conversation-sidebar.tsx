"use client";

import { Button } from "@/components/ui/button";

export type SidebarConversation = { id: string; title: string };

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  disabled,
}: {
  conversations: SidebarConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <aside className="flex w-64 flex-col gap-2 border-r p-3">
      <Button onClick={onNew} disabled={disabled}>
        + New chat
      </Button>
      <ul className="flex flex-col gap-1">
        {conversations.map((c) => (
          <li key={c.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              disabled={disabled}
              className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                c.id === activeId ? "bg-muted font-medium" : "hover:bg-muted"
              }`}
            >
              {c.title}
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => onDelete(c.id)}
              disabled={disabled}
              className="text-muted-foreground px-1 text-sm hover:text-red-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
