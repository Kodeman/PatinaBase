import type { Meta, StoryObj } from '@storybook/react'
import { Code } from './Code'

const meta: Meta<typeof Code> = {
  title: 'Typography/Code',
  component: Code,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['inline', 'block'],
    },
    colorScheme: {
      control: 'select',
      options: ['default', 'primary', 'secondary', 'success', 'warning', 'error'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Code>

export const Inline: Story = {
  args: {
    variant: 'inline',
    children: 'npm install @patina/design-system',
  },
}

export const Block: Story = {
  args: {
    variant: 'block',
    children: `const greeting = "Hello World";
console.log(greeting);`,
  },
}

export const WithCopyButton: Story = {
  args: {
    variant: 'block',
    showCopy: true,
    children: `function add(a, b) {
  return a + b;
}

const result = add(2, 3);
console.log(result); // 5`,
  },
}

export const JavaScript: Story = {
  args: {
    variant: 'block',
    language: 'javascript',
    showCopy: true,
    children: `// Array methods example
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const sum = doubled.reduce((a, b) => a + b, 0);
console.log(sum); // 30`,
  },
}

export const TypeScript: Story = {
  args: {
    variant: 'block',
    language: 'typescript',
    showCopy: true,
    children: `interface User {
  id: string;
  name: string;
  email: string;
}

const user: User = {
  id: "1",
  name: "John Doe",
  email: "john@example.com"
};`,
  },
}

export const JSON: Story = {
  args: {
    variant: 'block',
    language: 'json',
    showCopy: true,
    children: `{
  "name": "@patina/design-system",
  "version": "0.1.0",
  "description": "Design system components"
}`,
  },
}

export const CSS: Story = {
  args: {
    variant: 'block',
    language: 'css',
    showCopy: true,
    children: `.button {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  background-color: #3b82f6;
  color: white;
}

.button:hover {
  background-color: #2563eb;
}`,
  },
}

export const Primary: Story = {
  args: {
    variant: 'inline',
    colorScheme: 'primary',
    children: 'API_KEY',
  },
}

export const Success: Story = {
  args: {
    variant: 'inline',
    colorScheme: 'success',
    children: 'SUCCESS',
  },
}

export const Warning: Story = {
  args: {
    variant: 'inline',
    colorScheme: 'warning',
    children: 'DEPRECATED',
  },
}

export const Error: Story = {
  args: {
    variant: 'inline',
    colorScheme: 'error',
    children: 'ERROR',
  },
}

export const InParagraph: Story = {
  render: () => (
    <p className="text-base">
      To install the package, run <Code>npm install @patina/design-system</Code> in your terminal.
      Then import the components using <Code>import {`{ Button }`} from '@patina/design-system'</Code>.
    </p>
  ),
}

export const MultipleInline: Story = {
  render: () => (
    <div className="space-y-2">
      <p>
        Use <Code>useState</Code> for local state management.
      </p>
      <p>
        Use <Code>useEffect</Code> for side effects.
      </p>
      <p>
        Use <Code>useContext</Code> for consuming context.
      </p>
    </div>
  ),
}

export const CommandLine: Story = {
  args: {
    variant: 'block',
    language: 'bash',
    showCopy: true,
    children: `$ npm install
$ npm run dev
$ npm run build`,
  },
}

export const LongCode: Story = {
  args: {
    variant: 'block',
    language: 'typescript',
    showCopy: true,
    children: `import React, { useState, useEffect } from 'react';

interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
}

export const TodoList: React.FC = () => {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [input, setInput] = useState('');

  const addTodo = () => {
    if (input.trim()) {
      setTodos([
        ...todos,
        { id: Date.now(), text: input, completed: false }
      ]);
      setInput('');
    }
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  return (
    <div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && addTodo()}
      />
      <button onClick={addTodo}>Add</button>
      <ul>
        {todos.map(todo => (
          <li
            key={todo.id}
            onClick={() => toggleTodo(todo.id)}
            style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}
          >
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
};`,
  },
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-2xl font-bold">Installation</h2>
      <p>Install the package using npm:</p>
      <Code variant="block" showCopy language="bash">
        npm install @patina/design-system
      </Code>
      <p>Or using yarn:</p>
      <Code variant="block" showCopy language="bash">
        yarn add @patina/design-system
      </Code>
      <h2 className="text-2xl font-bold mt-8">Usage</h2>
      <p>Import and use components in your React application:</p>
      <Code variant="block" showCopy language="typescript">
{`import { Button, Card, Input } from '@patina/design-system';

function App() {
  return (
    <Card>
      <Input placeholder="Enter your name" />
      <Button>Submit</Button>
    </Card>
  );
}`}
      </Code>
    </div>
  ),
}
