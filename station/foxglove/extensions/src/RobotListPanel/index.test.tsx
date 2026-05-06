import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock context factory
function createMockContext() {
  const subscriptions: { topic: string; cb?: () => void }[] = [];
  let onRenderCb: ((rs: Record<string, unknown>) => void) | undefined;
  const saveStateCb = vi.fn();

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
      advertise: vi.fn(),
      get onRender() {
        return onRenderCb;
      },
      set onRender(cb: ((rs: Record<string, unknown>) => void) | undefined) {
        onRenderCb = cb;
      },
      panel: { config: {} },
      theme: { palette: "dark" as const, primaryColor: "#4fc3f7" },
      saveState: saveStateCb,
    },
    subscriptions,
    triggerRender(rs: Record<string, unknown>) {
      onRenderCb?.(rs);
    },
  };
}

// Helper: create a minimal render-state with a robot list message
function robotListRs(robots: Record<string, unknown>[]) {
  return {
    messages: {
      "/station/robot_list": [
        {
          message: JSON.stringify({ robots }),
        },
      ],
    },
  };
}

describe("RobotListPanel", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders loading state initially", async () => {
    const mock = createMockContext();
    const { RobotListPanel } = await import("./index");
    const { render } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(RobotListPanel, { context: mock.context as any }),
    );
    expect(container.textContent).toContain("等待机器人数据...");
  });

  it("renders robots after data arrives", async () => {
    const mock = createMockContext();
    const { RobotListPanel } = await import("./index");
    const { render, act } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(RobotListPanel, { context: mock.context as any }),
    );

    await act(async () => {
      mock.triggerRender(
        robotListRs([
          { robot_id: "robot_01", online: true, status: { battery: 85, mode: "auto" } },
        ]),
      );
    });

    expect(container.textContent).toContain("robot_01");
    expect(container.textContent).toContain("Robot List");
  });

  it("shows error banner when robot list is invalid", async () => {
    const mock = createMockContext();
    const { RobotListPanel } = await import("./index");
    const { render, act } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(RobotListPanel, { context: mock.context as any }),
    );

    await act(async () => {
      mock.triggerRender({
        messages: {
          "/station/robot_list": [{ message: JSON.stringify({}) }],
        },
      });
    });

    // After onRender fires with invalid data, component should show the error
    expect(container.textContent).toContain("Invalid robot list");
  });

  it("publishes selection on click", async () => {
    const mock = createMockContext();
    const { RobotListPanel } = await import("./index");
    const { render, act, fireEvent, waitFor } = await import("@testing-library/react");

    const { container } = render(
      React.createElement(RobotListPanel, { context: mock.context as any }),
    );

    await act(async () => {
      mock.triggerRender(
        robotListRs([
          { robot_id: "robot_01", online: true, status: {} },
        ]),
      );
    });

    // Click on the robot
    const robotEl = container.querySelector('[role="option"]');
    expect(robotEl).not.toBeNull();
    if (robotEl) {
      await act(async () => {
        fireEvent.click(robotEl);
      });
    }

    // Should have published selected_robots with the selected robot_id
    await waitFor(() => {
      expect(mock.context.publish).toHaveBeenCalledWith(
        "/station/selected_robots",
        expect.objectContaining({
          data: expect.stringContaining("robot_01"),
        }),
      );
    });
  });

  it('advertises discover and selected_robots topics', async () => {
    const mock = createMockContext();
    const { RobotListPanel } = await import("./index");
    const { render } = await import("@testing-library/react");

    render(
      React.createElement(RobotListPanel, { context: mock.context as any }),
    );

    expect(mock.context.advertise).toHaveBeenCalledWith(
      "/station/discover",
      "std_msgs/String",
    );
    expect(mock.context.advertise).toHaveBeenCalledWith(
      "/station/selected_robots",
      "std_msgs/String",
    );
  });
});
