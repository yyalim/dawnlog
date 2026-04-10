import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";

export interface SelectChoice<T extends string> {
  label: string;
  value: T;
}

// ── TextArea (multiline input) ─────────────────────────────────────────

function insertAt(str: string, insert: string, index: number): string {
  return str.slice(0, index) + insert + str.slice(index);
}

interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
}

function TextArea({ value, onChange }: TextAreaProps) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.return) {
      const newValue = insertAt(value, "\n", cursor);
      onChange(newValue);
      setCursor(cursor + 1);
    } else if (key.leftArrow) {
      if (cursor > 0) setCursor(cursor - 1);
    } else if (key.rightArrow) {
      if (cursor < value.length) setCursor(cursor + 1);
    } else if (key.upArrow) {
      const before = value.slice(0, cursor);
      const lastNewline = before.lastIndexOf("\n");
      if (lastNewline >= 0) {
        const col = cursor - lastNewline - 1;
        const prevLineStart = before.lastIndexOf("\n", lastNewline - 1) + 1;
        const prevLineLen = lastNewline - prevLineStart;
        setCursor(prevLineStart + Math.min(col, prevLineLen));
      }
    } else if (key.downArrow) {
      const after = value.slice(cursor);
      const nextNewline = after.indexOf("\n");
      if (nextNewline >= 0) {
        const before = value.slice(0, cursor);
        const currentLineStart = before.lastIndexOf("\n") + 1;
        const col = cursor - currentLineStart;
        const nextLineStart = cursor + nextNewline + 1;
        const nextNextNewline = value.indexOf("\n", nextLineStart);
        const nextLineLen = nextNextNewline >= 0 ? nextNextNewline - nextLineStart : value.length - nextLineStart;
        setCursor(nextLineStart + Math.min(col, nextLineLen));
      }
    } else if (key.backspace || key.delete) {
      if (cursor > 0) {
        onChange(`${value.slice(0, cursor - 1)}${value.slice(cursor)}`);
        setCursor(cursor - 1);
      }
    } else if (input && !key.ctrl && !key.meta) {
      const newValue = insertAt(value, input, cursor);
      onChange(newValue);
      setCursor(cursor + input.length);
    }
  });

  // Render text with cursor highlight
  const before = value.slice(0, cursor);
  const cursorChar = cursor < value.length ? value.slice(cursor, cursor + 1) : " ";
  const after = cursor < value.length ? value.slice(cursor + 1) : "";

  return (
    <Text>
      {before}
      <Text inverse>{cursorChar}</Text>
      {after}
    </Text>
  );
}

// ── MultilinePrompt ────────────────────────────────────────────────────

interface MultilinePromptProps {
  prompt: string;
  onSubmit: (value: string) => void;
}

function MultilinePrompt({ prompt, onSubmit }: MultilinePromptProps) {
  const [value, setValue] = useState("");
  const { exit } = useApp();

  useInput((_input, key) => {
    if (key.ctrl && _input === "d") {
      exit();
      onSubmit(value.trim());
    }
  });

  return (
    <Box flexDirection="column">
      <Text>{prompt}</Text>
      <Text dimColor>(Enter for new line, Ctrl+D to send)</Text>
      <Text>{" "}</Text>
      <TextArea value={value} onChange={setValue} />
    </Box>
  );
}

export function askMultiline(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const instance = render(
      <MultilinePrompt
        prompt={prompt}
        onSubmit={(value) => {
          instance.unmount();
          resolve(value);
        }}
      />,
    );
  });
}

// ── SingleLineInput ────────────────────────────────────────────────────

interface SingleLineInputProps {
  prompt: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
}

function SingleLineInput({ prompt, defaultValue, onSubmit }: SingleLineInputProps) {
  const [value, setValue] = useState("");
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.return) {
      exit();
      onSubmit(value.trim() || defaultValue || "");
    } else if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta && !key.leftArrow && !key.rightArrow && !key.upArrow && !key.downArrow) {
      setValue((v) => v + input);
    }
  });

  const displayDefault = defaultValue ? ` [${defaultValue}]` : "";

  return (
    <Text>
      {prompt}{displayDefault}: {value}
      <Text inverse>{" "}</Text>
    </Text>
  );
}

export function askSingleLine(prompt: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const instance = render(
      <SingleLineInput
        prompt={prompt}
        defaultValue={defaultValue}
        onSubmit={(value) => {
          instance.unmount();
          resolve(value);
        }}
      />,
    );
  });
}

// ── SelectInput ────────────────────────────────────────────────────────

interface SelectInputProps<T extends string> {
  prompt: string;
  choices: SelectChoice<T>[];
  onSelect: (value: T) => void;
}

function SelectInput<T extends string>({ prompt, choices, onSelect }: SelectInputProps<T>) {
  const [selected, setSelected] = useState(0);
  const { exit } = useApp();

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelected((s) => (s > 0 ? s - 1 : choices.length - 1));
    } else if (key.downArrow) {
      setSelected((s) => (s < choices.length - 1 ? s + 1 : 0));
    } else if (key.return) {
      const choice = choices[selected];
      if (choice) {
        exit();
        onSelect(choice.value);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text>{prompt}</Text>
      {choices.map((choice, i) => (
        <Text key={choice.value}>
          {i === selected ? (
            <Text color="cyan"> ❯ {choice.label}</Text>
          ) : (
            <Text>   {choice.label}</Text>
          )}
        </Text>
      ))}
    </Box>
  );
}

export function askSelect<T extends string>(
  prompt: string,
  choices: SelectChoice<T>[],
): Promise<T> {
  return new Promise((resolve) => {
    const instance = render(
      <SelectInput
        prompt={prompt}
        choices={choices}
        onSelect={(value) => {
          instance.unmount();
          resolve(value);
        }}
      />,
    );
  });
}
