export function joinWithLimit(lines: string[], maxLength: number): string {
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    const next = result ? `${result}\n${lines[i]}` : lines[i];
    if (next.length > maxLength - 20) {
      return `${result}\n…and ${lines.length - i} more`;
    }
    result = next;
  }
  return result;
}

export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
