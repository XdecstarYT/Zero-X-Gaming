/// <reference lib="webworker" />
import { createRunner, type ToSim } from "./runner";

const runner = createRunner((m, transfer) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer ?? []));
self.onmessage = (e: MessageEvent<ToSim>) => runner.handle(e.data);
