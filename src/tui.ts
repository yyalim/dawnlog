import readline from "readline";

export interface SelectChoice<T extends string> {
  label: string;
  value: T;
}

export function askSingleLine(prompt: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const displayPrompt = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;

    rl.question(displayPrompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

export function askMultiline(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${prompt}\n(Press Ctrl+D when done, Ctrl+C to cancel)\n\n`);

    const lines: string[] = [];

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on("line", (line) => {
      lines.push(line);
    });

    rl.on("close", () => {
      resolve(lines.join("\n").trim());
    });

    rl.on("SIGINT", () => {
      rl.close();
      process.stdout.write("\n");
      reject(new Error("Cancelled"));
    });
  });
}

export function askSelect<T extends string>(
  prompt: string,
  choices: SelectChoice<T>[],
): Promise<T> {
  return new Promise((resolve) => {
    process.stdout.write(`${prompt}\n`);
    choices.forEach((choice, i) => {
      process.stdout.write(`  ${i + 1}. ${choice.label}\n`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = () => {
      rl.question(`Enter number (1-${choices.length}): `, (answer) => {
        const idx = parseInt(answer.trim(), 10) - 1;
        if (idx >= 0 && idx < choices.length) {
          rl.close();
          const chosen = choices[idx];
          if (chosen) {
            resolve(chosen.value);
          }
        } else {
          process.stdout.write(`Please enter a number between 1 and ${choices.length}.\n`);
          ask();
        }
      });
    };

    ask();
  });
}
