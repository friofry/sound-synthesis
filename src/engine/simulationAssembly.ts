import type { GraphData } from "./types";

export function forEachSpringLine(
  graph: GraphData,
  visitor: (line: GraphData["lines"][number], dot1: GraphData["dots"][number], dot2: GraphData["dots"][number]) => void,
): void {
  for (const line of graph.lines) {
    const dot1 = graph.dots[line.dot1];
    const dot2 = graph.dots[line.dot2];
    if (!dot1 || !dot2) {
      continue;
    }
    visitor(line, dot1, dot2);
  }
}
