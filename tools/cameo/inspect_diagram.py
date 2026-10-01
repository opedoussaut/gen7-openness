"""Inspect the paths of one exported diagram (debug helper)."""
import asyncio, json, sys, collections
from mcp_session import McpCameo

async def main(key):
    s = json.load(open("../evidence/state.json"))
    async with McpCameo("../evidence/events-inspect.jsonl", phase="inspect") as c:
        r = await c.call("cameo_list_diagram_shapes", diagram_id=s[f"diagram.{key}"], limit=500)
        shapes = r["shapes"]
        print(collections.Counter((x.get("shapeType"), x.get("elementType")) for x in shapes).most_common(30))
        for x in shapes:
            if x.get("elementType") in ("Connector", "InformationFlow") or "Path" in (x.get("shapeType") or ""):
                print(x.get("shapeType"), x.get("elementType"), x.get("elementId"), x.get("bounds"))
                break

asyncio.run(main(sys.argv[1]))
