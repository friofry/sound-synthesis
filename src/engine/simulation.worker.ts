/// <reference lib="webworker" />

import { runSimulation } from "./simulation";
import type { SimulationWorkerMessage, SimulationWorkerRequest } from "./types";

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  try {
    const { graph, params, outputMode = "full", backend } = event.data;
    const result = runSimulation(graph, params, (completed, total) => {
      const progress: SimulationWorkerMessage = { type: "progress", completed, total };
      self.postMessage(progress);
    }, { capture: outputMode, backend });

    if (outputMode === "playing-point-only") {
      const transferBuffer = result.playingPointBuffer.buffer;
      const message: SimulationWorkerMessage = {
        type: "complete",
        outputMode,
        playingPointBuffer: result.playingPointBuffer,
      };
      self.postMessage(message, [transferBuffer]);
      return;
    }

    const message: SimulationWorkerMessage = { type: "complete", outputMode, result };
    self.postMessage(message);
  } catch (error) {
    const message: SimulationWorkerMessage = {
      type: "error",
      message: error instanceof Error ? error.message : "Simulation failed",
    };
    self.postMessage(message);
  }
};

export {};
