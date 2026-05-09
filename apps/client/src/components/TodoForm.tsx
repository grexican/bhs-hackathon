import { type FormEvent, useState } from "react";

// Simple controlled form for adding a new todo. Calls onAdd with the text,
// then clears the input. Empty submissions are ignored.
export function TodoForm({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  }

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        placeholder="What needs doing?"
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit">Add</button>
    </form>
  );
}
