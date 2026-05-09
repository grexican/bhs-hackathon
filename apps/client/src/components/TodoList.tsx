import type { Todo } from "../api";

// Renders the list. Each row is a checkbox + the text + a delete button.
// All state changes go through the parent via onToggle / onDelete.
export function TodoList({
  todos,
  onToggle,
  onDelete,
}: {
  todos: Todo[];
  onToggle: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
}) {
  if (todos.length === 0) {
    return <p className="muted">No todos yet — add one above.</p>;
  }

  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <li key={todo.id} className={todo.done ? "todo todo--done" : "todo"}>
          <label>
            <input
              type="checkbox"
              checked={todo.done === 1}
              onChange={(e) => onToggle(todo.id, e.target.checked)}
            />
            <span>{todo.text}</span>
          </label>
          <button type="button" className="todo__delete" onClick={() => onDelete(todo.id)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
