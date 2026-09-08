#!/usr/bin/env python3
"""Check that the two parsers still agree.

displayer/lib/parse.js and tools/lyriclib.py implement the same grammar in two
languages. If they drift, validate.py keeps passing while the browser renders
something else — a failure with no visible symptom until the alignment is
silently wrong. This parses one fixture with both and compares.

Needs node only to run the test; the app itself has no node dependency.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lyriclib  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "parser.txt"
PARSE_JS = lyriclib.ROOT / "displayer" / "lib" / "parse.js"


def js_parse(text: str, module_path: str):
    script = (
        f"import {{ parseSections }} from {json.dumps(module_path)};\n"
        "const chunks = [];\n"
        "for await (const c of process.stdin) chunks.push(c);\n"
        "const s = Buffer.concat(chunks).toString('utf8');\n"
        "process.stdout.write(JSON.stringify(parseSections(s)));\n"
    )
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=text.encode("utf-8"), capture_output=True)
    if out.returncode:
        raise RuntimeError(out.stderr.decode("utf-8", "replace").strip())
    return json.loads(out.stdout)


def main():
    if not shutil.which("node"):
        print("  skip   node not installed — cannot compare the two parsers")
        return 0

    # The project has no package.json, so node reads a bare .js as CommonJS.
    # Copy the module to a .mjs alongside it rather than adding node config to
    # a deliberately dependency-free project.
    tmp = tempfile.TemporaryDirectory()
    shim = Path(tmp.name) / "parse.mjs"
    shim.write_text(PARSE_JS.read_text("utf-8"), "utf-8")
    module_path = shim.as_uri()

    text = FIXTURE.read_text("utf-8")
    cases = {
        "fixture": text,
        "crlf": text.replace("\n", "\r\n"),
        "no trailing newline": text.rstrip("\n"),
        "leading blank lines": "\n\n" + text,
        "empty": "",
        "blank only": "\n\n\n",
    }

    failures = 0
    for name, sample in cases.items():
        py = lyriclib.parse_sections(sample)
        js = js_parse(sample, module_path)
        if py == js:
            print(f"  ok     {name}")
        else:
            failures += 1
            print(f"  FAIL   {name}")
            print(f"           python: {json.dumps(py, ensure_ascii=False)}")
            print(f"           js:     {json.dumps(js, ensure_ascii=False)}")

    print(f"\n{len(cases) - failures}/{len(cases)} cases agree")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
