export async function withEnv<T>(
  updates: Record<string, string | undefined>,
  run: () => Promise<T> | T,
): Promise<T> {
  const originalEntries = Object.entries(updates).map(([key]) => [key, process.env[key]] as const);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of originalEntries) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
