import { useCallback, useEffect, useState } from "react";

import { api, type Todo } from "../api";

// Custom hook bundling everything the UI needs to work with todos:
// - the current list
// - loading + error state
// - addTodo / toggleTodo / deleteTodo handlers that update the list optimistically
//
// Components just call useTodos() and use the returned values.
// To build a similar hook for your own resource (flashcards, sessions, posts),
// copy this file and replace "todo(s)" with your resource name.
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the current list from the server. Called on mount and after any
  // mutation so the UI reflects what's actually in the database.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Todo[]>("/api/todos");
      setTodos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the list once when the component mounts.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addTodo = useCallback(async (text: string) => {
    setError(null);
    try {
      const created = await api.post<Todo>("/api/todos", { text });
      setTodos((prev) => [created, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  const toggleTodo = useCallback(
    async (id: number, done: boolean) => {
      setError(null);
      // Optimistic update — flip the local state immediately so the UI feels snappy.
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: done ? 1 : 0 } : t)));
      try {
        await api.patch<Todo>(`/api/todos/${id}`, { done });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        // Roll back on failure by re-reading the truth from the server.
        void refresh();
      }
    },
    [refresh]
  );

  const deleteTodo = useCallback(
    async (id: number) => {
      setError(null);
      const previous = todos;
      setTodos((prev) => prev.filter((t) => t.id !== id));
      try {
        await api.delete(`/api/todos/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        setTodos(previous);
      }
    },
    [todos]
  );

  return { todos, loading, error, addTodo, toggleTodo, deleteTodo, refresh };
}
