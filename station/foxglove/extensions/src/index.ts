/** Foxglove Studio extension entry point — registers all 6 custom panels. */
import type { ExtensionContext } from "@foxglove/studio";

import { RobotListPanel } from "./RobotListPanel";
import { CommandPanel } from "./CommandPanel";
import { TopicConfigPanel } from "./TopicConfigPanel";
import { EventPanel } from "./EventPanel";
import { FleetCommPanel } from "./FleetCommPanel";
import { TrafficMonitor } from "./TrafficMonitor";

export function activate(context: ExtensionContext): void {
  context.registerPanel({ name: "RobotListPanel", initPanel: RobotListPanel });
  context.registerPanel({ name: "CommandPanel", initPanel: CommandPanel });
  context.registerPanel({ name: "TopicConfigPanel", initPanel: TopicConfigPanel });
  context.registerPanel({ name: "EventPanel", initPanel: EventPanel });
  context.registerPanel({ name: "FleetCommPanel", initPanel: FleetCommPanel });
  context.registerPanel({ name: "TrafficMonitor", initPanel: TrafficMonitor });
}
