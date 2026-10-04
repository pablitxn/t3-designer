# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp==1.30.0"]
# ///
"""Read-only MCP handshake with the installed Blender server and open Blender."""

import asyncio
import json
import os
import shutil

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    command = shutil.which("mcp-for-blender")
    if not command:
        raise SystemExit("Install first: uv tool install mcp-for-blender==2.1.0")
    params = StdioServerParameters(command=command, env={
        **os.environ,
        "DISABLE_TELEMETRY": "true",
        "BLENDER_HOST": "127.0.0.1",
        "BLENDER_PORT": "9876",
    })
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            tools = await session.list_tools()
            result = await session.call_tool("get_addon_status", {})
            text = "\n".join(c.text for c in result.content if c.type == "text")
            try:
                status = json.loads(text)
            except ValueError:
                raise SystemExit(f"Blender did not report a valid status: {text}")
            if result.isError or not status.get("up_to_date"):
                raise SystemExit(f"Blender connection needs attention: {text}")
            if status.get("telemetry_consent") is not False:
                raise SystemExit("Disable Allow Telemetry in the Blender add-on preferences.")
            print(json.dumps({
                "connected": True,
                "blender": status["blender_version"],
                "protocol": status["protocol_version"],
                "tools": len(tools.tools),
                "telemetry_consent": status["telemetry_consent"],
            }, indent=2))


if __name__ == "__main__":
    asyncio.run(asyncio.wait_for(main(), timeout=30))
