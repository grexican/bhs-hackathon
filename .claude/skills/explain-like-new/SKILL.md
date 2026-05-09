---
name: explain-like-new
description: >
  When writing code for a non-coder student, add a plain-English comment at
  the top of each function or section explaining WHAT it does in everyday
  language. Use when generating any new file, function, route, component, or
  meaningful code block. The student needs to be able to read their own code
  later and understand it.
---

# Explain Like New

The student didn't write this code — you did. They need to be able to read it tomorrow and understand what it does without asking you. Help them.

## The rule

For every meaningful chunk of code you write, add a **one-line plain-English comment at the top** explaining what it does. Not how it does it — what it does.

## What "meaningful" means

Add a comment for:

- Every function or React component.
- Every Express route.
- Every database query.
- Every non-obvious block of logic (a `useEffect` that does something tricky, a regex, a complex condition).

Skip comments for:

- One-line trivial code.
- Code where the variable names already say everything.
- Imports.

## Tone

Plain English. Imagine you're explaining to a friend who hasn't seen the file:

```ts
// Get all the todos from the database, newest first.
router.get("/api/todos", (req, res) => {
  const todos = db.prepare("SELECT * FROM todos ORDER BY created_at DESC").all();
  res.json(todos);
});

// Mark a todo as done. Updates the row matching the URL id.
router.patch("/api/todos/:id/done", (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE todos SET done = 1 WHERE id = ?").run(id);
  res.json({ ok: true });
});
```

```tsx
// Top of the page — shows the title and the new-todo input.
function Header({ onAdd }: { onAdd: (text: string) => void }) {
  // ...
}

// Renders the list of todos. Each one has a checkbox to mark done and a
// delete button.
function TodoList({ todos, onToggle, onDelete }) {
  // ...
}
```

## Things to avoid

- Don't restate the line below the comment. `// set x to 5` above `const x = 5;` is noise.
- Don't write comments that only repeat the function name. `// getTodos: get the todos` is useless.
- Don't write API documentation paragraphs. One sentence is enough.

## Why this matters

After the hackathon, the student wants to keep building on this. They'll open the file in a week and need to remember what it does. Your comments are their notes-to-self.
