import fs from "fs";
import path from "path";
import { env } from "./config.js";

export function seedHandoffFiles(): void {
  const handoffFiles = [
    {
      name: "TASK.md",
      content: "# Active Task\n\nImplement and verify workspace capabilities.",
    },
    {
      name: "CONTEXT.md",
      content:
        "# Context & Constraints\n\n- Stateless MCP server\n- Sandbox security enforced",
    },
    {
      name: "PROGRESS.md",
      content:
        "# Progress Log\n\n- [ ] Initialize workspace\n- [ ] Run session test",
    },
    {
      name: "NEXT.md",
      content: "# Next Steps\n\n1. Complete milestone M5 execution.",
    },
  ];

  if (!fs.existsSync(env.WORKSPACE_ROOT)) {
    fs.mkdirSync(env.WORKSPACE_ROOT, { recursive: true });
  }

  for (const file of handoffFiles) {
    const filePath = path.join(env.WORKSPACE_ROOT, file.name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, file.content, "utf-8");
    }
  }
}
