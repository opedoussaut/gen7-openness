"""STEP 5–7: inspect the actual CATIA Magic / Cameo environment through the cameo-mcp-bridge MCP server.

Writes capabilities.json (raw, verified answers) next to the event log. Nothing is assumed: every field is the
answer of a tool call, or the error it returned.
"""
import asyncio
import json
import os
import sys

from mcp_session import McpCameo

ENV_PROBE = r'''
import com.nomagic.magicdraw.core.Application
import com.google.gson.Gson
def out = [:]
def app = Application.getInstance()
def tryGet = { String k, Closure c -> try { out[k] = c() } catch (Throwable e) { out[k + 'Error'] = e.toString() } }
tryGet('applicationVersion') { app.getVersion()?.toString() }
tryGet('environmentEdition') { com.nomagic.magicdraw.core.ApplicationEnvironment.getEditionName() }
tryGet('buildNumber') { com.nomagic.magicdraw.core.ApplicationEnvironment.getBuildNumber()?.toString() }
tryGet('installRoot') { com.nomagic.magicdraw.core.ApplicationEnvironment.getInstallRoot() }
out.systemProperties = System.getProperties().findAll { k, v -> k.toString() =~ /(?i)(version|magic|catia|md\.|edition)/ }.collectEntries { k, v -> [(k.toString()): v.toString()] }
def plugins = []
try {
  com.nomagic.magicdraw.plugins.PluginUtils.getPlugins().each { p ->
    def d = p.getDescriptor()
    plugins << [id: d.getID(), name: d.getName(), version: d.getVersion()?.toString()]
  }
} catch (Throwable e) { out.pluginsError = e.toString() }
out.plugins = plugins.sort { it.name }
def project = app.getProject()
out.project = project?.getName()
tryGet('projectFile') { project?.getFileName() }
tryGet('usedProfiles') { com.nomagic.uml2.ext.jmi.helpers.StereotypesHelper.getAllProfiles(project).collect { it.getName() }.sort() }
return new Gson().toJson(out)
'''


async def main(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    events = os.path.join(out_dir, "events-probe.jsonl")
    open(events, "w").close()
    cap: dict = {}
    async with McpCameo(events, phase="probe") as c:
        cap["mcpServer"] = c.server_info
        cap["mcpTools"] = c.tools
        cap["status"] = await c.call("cameo_status", "Bridge health and compatibility")
        cap["capabilities"] = await c.call("cameo_get_capabilities", "Bridge capability manifest", allow_fail=True)
        cap["project"] = await c.call("cameo_get_project", "Open project")
        cap["diagramTypes"] = await c.call("cameo_list_diagram_types", "Supported diagram types", allow_fail=True)
        cap["matrixKinds"] = await c.call("cameo_list_matrix_kinds", "Native matrix kinds", allow_fail=True)
        cap["simulation"] = await c.call("cameo_get_simulation_capabilities", "Simulation Toolkit probe", allow_fail=True)
        cap["simulationConfigurations"] = await c.call("cameo_list_simulation_configurations", "Simulation configurations", allow_fail=True)
        cap["profiles"] = await c.call("cameo_get_profile_capabilities", "Profile capabilities", allow_fail=True)
        cap["typedDiagrams"] = await c.call("cameo_get_typed_diagram_capabilities", "Typed diagram capabilities", allow_fail=True)
        cap["extensions"] = await c.call("cameo_get_extension_capabilities", "Extension capabilities", allow_fail=True)
        cap["requirements"] = await c.call("cameo_get_requirements_capabilities", "Requirements import/export", allow_fail=True)
        cap["environment"] = await c.call("cameo_execute_macro", "Read application version, plugins and profiles", allow_fail=True, script=ENV_PROBE)
        cap["topLevel"] = await c.call("cameo_get_containment_tree", "Top-level packages", allow_fail=True, depth=1)
        cap["calls"] = c.calls
    with open(os.path.join(out_dir, "capabilities.json"), "w", encoding="utf-8") as fh:
        json.dump(cap, fh, indent=2, default=str)
    print(json.dumps({k: (v if k in ("mcpServer", "project") else "…") for k, v in cap.items()}, indent=1, default=str)[:1500])


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "out"))
