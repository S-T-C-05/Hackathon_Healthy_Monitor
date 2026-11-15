"""Turn the design team's standalone ApolloCare HTML into frontend/index.html.

    python tools/integrate_apollocare.py path/to/ApolloCare_V14_Confirmacion_Guardado.html

ApolloCare is delivered as ONE self-contained HTML file and keeps evolving (V14, V15...).
This script applies the few hooks the integration needs and leaves the rest untouched, so a
new version can be re-integrated by running it again. Everything else the integration does
lives in frontend/src/apollo/*.ts and is loaded by the <script type="module"> added here.

Each edit must match exactly once. If a new ApolloCare version changed one of those lines,
the script stops and says which hook needs a look (nothing is written).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "index.html"
MARK = "[INTEGRATION]"

# (name, text to find, replacement)
EDITS: list[tuple[str, str, str]] = [
    (
        "profile ids may contain '_' (crew_zelinda)",
        "/^[a-zA-Z0-9-]{1,80}$/",
        "/^[a-zA-Z0-9_-]{1,80}$/",
    ),
    (
        "profile card: role line for crew members",
        "desc.textContent=p.demo?'Perfil de demostración':('ID: '+p.id.slice(0,8));",
        "desc.textContent=p.crew?(p.role||''):(p.demo?'Perfil de demostración':('ID: '+p.id.slice(0,8))); /* " + MARK + " */",
    ),
    (
        "profile card: no delete for crew members, decoration hook",
        "item.append(avatar,name,desc,button,del);host.appendChild(item);",
        "item.append(avatar,name,desc,button);if(!p.crew)item.append(del);host.appendChild(item);if(api.decorate)api.decorate(item,p); /* " + MARK + " */",
    ),
    (
        "Profiles: crew list from the backend",
        "return {currentId,active,historyKey,show};",
        "/* " + MARK + " crew profiles come from the backend (src/apollo/profiles.ts) */\n"
        "  let crewMode=false;\n"
        "  function useCrew(list){\n"
        "    profiles=list.map(m=>({id:m.id,name:m.name,role:m.role||'',demo:false,crew:true}));crewMode=true;\n"
        "    try{activeId=localStorage.getItem(ACTIVE_KEY);}catch(e){activeId=null;}\n"
        "    if(!profiles.some(p=>p.id===activeId))activeId=null;\n"
        "    updateShortcut();if(!$('#profileOverlay').hidden)render();\n"
        "  }\n"
        "  const api={currentId,active,historyKey,show,close,select,render,useCrew,list:()=>profiles.slice(),isCrewMode:()=>crewMode,decorate:null};\n"
        "  return api;",
    ),
    (
        "Lang.extend: extra strings for the language selector",
        "return {current:()=>language,t,apply,set,voiceLocale,messages};",
        "/* " + MARK + " */\n"
        "  function extend(more){Object.assign(catalog,more);for(const [base,langs] of Object.entries(more))for(const value of Object.values(langs))if(value)reverse.set(value,base);}\n"
        "  return {current:()=>language,t,apply,set,voiceLocale,messages,extend};",
    ),
    (
        "expose internals to src/apollo/*.ts",
        "Audio_.init();floatify();",
        "Audio_.init();floatify();\n"
        "/* " + MARK + " internals used by src/apollo/*.ts */\n"
        "Object.assign(window.ApolloCare,{hooks,THEME,Lang,TalkBack,toast,sfx});\n"
        "Object.defineProperty(window.ApolloCare,'current',{get:()=>current});\n"
        "/* " + MARK + " V14 calls speakIfEnabled() from the physical history, but it only exists inside Wellness */\n"
        "if(typeof speakIfEnabled==='undefined')window.speakIfEnabled=function(message){if(TalkBack.isEnabled())TalkBack.say(message);};",
    ),
    (
        "load the integration module",
        "</body>",
        '<script type="module" src="/src/apollo/main.ts"></script>\n</body>',
    ),
]


def integrate(html: str) -> str:
    if MARK in html:
        raise SystemExit("This file is already integrated. Pass the original ApolloCare HTML from the design team.")
    html = html.replace("\r\n", "\n")
    problems = []
    for name, find, repl in EDITS:
        n = html.count(find)
        if n != 1:
            problems.append(f"  - {name}: expected 1 match, found {n}\n      looking for: {find.splitlines()[0][:90]}")
            continue
        html = html.replace(find, repl)
    if problems:
        raise SystemExit("ApolloCare changed in a place the integration hooks into. Nothing was written.\n" + "\n".join(problems))
    return html


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    src = Path(argv[1])
    if not src.is_file():
        raise SystemExit(f"File not found: {src}")
    out = integrate(src.read_text(encoding="utf-8-sig"))  # utf-8-sig: tolerate a BOM from Windows editors
    OUT.write_text(out, encoding="utf-8", newline="\n")
    print(f"OK: {len(EDITS)} hooks applied -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
