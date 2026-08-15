import type { ShellControl } from "./ProximityControl";

/** Generic fallback when an experiment does not pass `getExportCode`. */
export function exportControlValues(controls: readonly ShellControl[]): string {
  const lines = controls.map(control => `  ${JSON.stringify(control.id)}: ${control.value},`);
  return `export const values = {\n${lines.join("\n")}\n};\n`;
}
