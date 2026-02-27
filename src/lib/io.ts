export async function readAllStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  const stdin = Bun.stdin.stream();

  for await (const chunk of stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function readStdinTrimmed(): Promise<string> {
  return (await readAllStdin()).trim();
}
