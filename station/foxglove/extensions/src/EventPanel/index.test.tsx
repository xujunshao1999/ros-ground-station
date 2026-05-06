import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

function createMockContext() {
  const subscriptions: { topic: string }[] = [];
  let onRenderCb: ((rs: Record<string, unknown>) => void) | undefined;

  return {
    context: {
      subscribe: vi.fn((topic: string) => {
        const entry = { topic };
        subscriptions.push(entry);
        return {
          unsubscribe: vi.fn(() => {
            const idx = subscriptions.indexOf(entry);
            if (idx >= 0) subscriptions.splice(idx, 1);
          }),
        };
      }),
      publish: vi.fn(),
      get onRender() {
        return onRenderCb;
      },
      set onRender(cb: ((rs: Record<string, unknown>) => void) | undefined) {
        onRenderCb = cb;
      },
      panel: { config: {} },
      theme: { palette: "dark" as const, primaryColor: "#4fc3f7" },
      saveState: vi.fn(),
    },
    subscriptions,
    triggerRender(rs: Record<string, unknown>) {
      onRenderCb?.(rs);
    },
  };
}

describe("EventPanel", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders loading state initially", async () => {
    const mock = createMockContext();
    const { EventPanel } = await import("./index");
    const { render } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(EventPanel, { context: mock.context as any }),
    );

    expect(container.textContent).toContain("等待数据...");
  });

  it("displays empty state when no events arrive", async () => {
    const mock = createMockContext();
    const { EventPanel } = await import("./index");
    const { render, act } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(EventPanel, { context: mock.context as any }),
    );

    // Trigger render with selected robots but no events
    await act(async () => {
      mock.triggerRender({
        messages: {
          "/station/selected_robots": [
            { message: JSON.stringify({ robot_ids: ["robot_01"] }) },
          ],
        },
      });
    });

    expect(container.textContent).toContain("Events");
  });

  it("subscribes to /station/selected_robots on mount", async () => {
    const mock = createMockContext();
    const { EventPanel } = await import("./index");
    const { render } = await import("@testing-library/react");

    render(
      React.createElement(EventPanel, { context: mock.context as any }),
    );

    expect(mock.context.subscribe).toHaveBeenCalledWith(
      "/station/selected_robots",
    );
  });
});
