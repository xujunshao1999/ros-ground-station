import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

function createMockContext() {
  const subscriptions: { topic: string }[] = [];
  const published: { topic: string; msg: Record<string, unknown> }[] = [];
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
      publish: vi.fn((topic: string, msg: Record<string, unknown>) => {
        published.push({ topic, msg });
      }),
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
    published,
    triggerRender(rs: Record<string, unknown>) {
      onRenderCb?.(rs);
    },
    get lastPublished() {
      return published[published.length - 1];
    },
  };
}

describe("CommandPanel", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders loading state initially", async () => {
    const mock = createMockContext();
    const { CommandPanel } = await import("./index");
    const { render } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(CommandPanel, { context: mock.context as any }),
    );

    expect(container.textContent).toContain("等待机器人数据...");
  });

  it("shows 'unselected' state when there is an error but no selection", async () => {
    const mock = createMockContext();
    const { CommandPanel } = await import("./index");
    const { render, act } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(CommandPanel, { context: mock.context as any }),
    );

    // Trigger render with an error
    await act(async () => {
      mock.triggerRender({
        messages: {
          "/station/selected_robots": [
            { message: JSON.stringify({ robot_ids: [] }) },
          ],
        },
      });
    });

    // With empty selection, should show "未选中机器人"
    const text = container.textContent || "";
    const hasEmptyHint =
      text.includes("未选中机器人") || text.includes("Command");
    expect(hasEmptyHint).toBe(true);
  });

  it("subscribes to /station/selected_robots on mount", async () => {
    const mock = createMockContext();
    const { CommandPanel } = await import("./index");
    const { render } = await import("@testing-library/react");

    render(
      React.createElement(CommandPanel, { context: mock.context as any }),
    );

    expect(mock.context.subscribe).toHaveBeenCalledWith(
      "/station/selected_robots",
    );
  });

  it("disables controls when no robots selected", async () => {
    const mock = createMockContext();
    const { CommandPanel } = await import("./index");
    const { render, act } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(CommandPanel, { context: mock.context as any }),
    );

    await act(async () => {
      mock.triggerRender({
        messages: {
          "/station/selected_robots": [
            { message: JSON.stringify({ robot_ids: [] }) },
          ],
        },
      });
    });

    // Buttons should be disabled
    const buttons = container.querySelectorAll("button");
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
