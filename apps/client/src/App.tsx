import { TodoForm } from "./components/TodoForm";
import { TodoList } from "./components/TodoList";
import { useTodos } from "./hooks/useTodos";

// Top-level page. Shows the title, the form to add a todo, and the list.
// This is the file you'll most often edit when adding new features —
// drop in new components or replace the whole layout for your own app.
export function App() {
  const { todos, loading, error, addTodo, toggleTodo, deleteTodo } = useTodos();

  return (
    <main className="page">
      <header className="page__header">
        <h1>BHS Hackathon Starter</h1>
        <p>
          A working React + Express + SQLite app. Edit it, replace it, build whatever you want on
          top of it.
        </p>
      </header>

      <section className="card">
        <h2>Demo: todos</h2>
        <p className="muted">
          Add, toggle, and delete todos. The data is stored in SQLite — refresh the page and
          everything is still there.
        </p>

        <TodoForm onAdd={addTodo} />

        {error && <div className="error">Error: {error}</div>}
        {loading && todos.length === 0 ? (
          <p className="muted">Loading…</p>
        ) : (
          <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
        )}
      </section>

      <footer className="page__footer">
        <p>
          Edit <code>apps/client/src/App.tsx</code> to change this page. Edit{" "}
          <code>apps/server/src/routes/</code> to change the API.
        </p>
      </footer>
    </main>
  );
}
