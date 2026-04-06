import { useMemo } from "react";
import { useGraphStore } from "../../store/graphStore";

type StatusBarViewProps = {
  text: string;
};

export function StatusBarView({ text }: StatusBarViewProps) {
  return <footer className="status-bar">{text}</footer>;
}

export function StatusBar() {
  const { graph, cursor, hoveredDot, hoveredLineIndex, simulationProgress, isSimulating } = useGraphStore();

  const text = useMemo(() => {
    const base = `${cursor.x} : ${cursor.y}`;

    if (hoveredDot !== null) {
      const dot = graph.dots[hoveredDot];
      if (!dot) {
        return base;
      }
      const linesText = dot.lines
        .slice(0, 4)
        .map((line) => line.k.toFixed(3))
        .join(", ");
      const input = dot.inputFile ?? "";
      return `${dot.x} : ${dot.y} = dot[${hoveredDot + 1}] : ${dot.fixed ? "fix" : "non-fix"}, W:${dot.weight.toFixed(
        6,
      )}, U:${dot.u.toFixed(4)}, V:${dot.v.toFixed(4)}, input:${input}; Lines: ${linesText}`;
    }

    if (hoveredLineIndex !== null) {
      const line = graph.lines[hoveredLineIndex];
      if (!line) {
        return base;
      }
      return `${base} = line[${line.dot1 + 1}-${line.dot2 + 1}] : K:${line.k.toFixed(6)}`;
    }

    if (isSimulating) {
      return `${base} | generating buffer... ${simulationProgress}%`;
    }

    return base;
  }, [cursor.x, cursor.y, graph.dots, graph.lines, hoveredDot, hoveredLineIndex, simulationProgress, isSimulating]);

  return <StatusBarView text={text} />;
}
