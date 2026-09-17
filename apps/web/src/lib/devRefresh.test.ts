import { describe, expect, test } from "bun:test";
import { requestCatalogRefresh, type CatalogRequest, type CatalogResponse, type LiveCatalogHot } from "./devRefresh";

function connection() {
  const listeners = new Set<(response: CatalogResponse) => void>();
  const sent: CatalogRequest[] = [];
  const hot: LiveCatalogHot = {
    send(_event, data) { sent.push(data); },
    on(_event, listener) { listeners.add(listener); },
    off(_event, listener) { listeners.delete(listener); },
  };
  return { hot, sent, listeners, reply(response: CatalogResponse) {
    for (const listener of listeners) listener(response);
  } };
}

describe("catalog refresh", () => {
  test("correlates concurrent replies and cleans up listeners", async () => {
    const client = connection();
    const first = requestCatalogRefresh(client.hot, "buttons/First");
    const second = requestCatalogRefresh(client.hot, "buttons/Second");
    expect(client.sent.map(request => request.slug)).toEqual(["buttons/First", "buttons/Second"]);
    client.reply({ requestId: "another-tab", timestamp: 1 });
    expect(client.listeners.size).toBe(2);
    client.reply({ requestId: client.sent[1]!.requestId, timestamp: 20 });
    expect(await second).toBe(20);
    expect(client.listeners.size).toBe(1);
    client.reply({ requestId: client.sent[0]!.requestId, timestamp: 10 });
    expect(await first).toBe(10);
    expect(client.listeners.size).toBe(0);
  });

  test("reports timeout instead of pretending the catalog is ready", async () => {
    const client = connection();
    await expect(requestCatalogRefresh(client.hot, undefined, 10)).rejects.toThrow("timed out");
    expect(client.listeners.size).toBe(0);
  });

  test("reports server errors", async () => {
    const client = connection();
    const result = requestCatalogRefresh(client.hot);
    client.reply({ requestId: client.sent[0]!.requestId, error: "Transform failed" });
    await expect(result).rejects.toThrow("Transform failed");
    expect(client.listeners.size).toBe(0);
  });

  test("reports unavailable HMR and send failures", async () => {
    await expect(requestCatalogRefresh(undefined)).rejects.toThrow("development server");
    const client = connection();
    client.hot.send = () => { throw new Error("Disconnected"); };
    await expect(requestCatalogRefresh(client.hot)).rejects.toThrow("Disconnected");
    expect(client.listeners.size).toBe(0);
  });
});
