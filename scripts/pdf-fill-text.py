"""
Print the typed-in values of a flattened, pre-filled PDF (the TaxCalcBench TY25 source
documents) together with the form's printed box numbers, as JSON:

    {"values": [{"page", "x", "y", "lines": [...]}, ...],
     "labels": [{"page", "x", "y", "text"}, ...]}

Those PDFs draw each entered value with its own font resource (/FILLTXT) at an absolute text
matrix; "labels" are the form's own text runs that start with a box number ("1", "12a", "2e")
or a word (for checkbox captions). src/answerkey/ty25-documents.ts assigns each value to the
nearest box label above it. Reads only the file named on the command line; writes to stdout.

    python3 -I scripts/pdf-fill-text.py <file.pdf>
"""
import json
import sys

from pypdf import PdfReader
from pypdf.generic import ContentStream


def mul(a, b):
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


def text_of(operands, op):
    if op == b"TJ":
        return "".join(str(x) for x in operands[0] if not isinstance(x, (int, float)))
    return str(operands[0])


def read(path):
    reader = PdfReader(path)
    values, labels = [], []
    for page_no, page in enumerate(reader.pages):
        fonts = page.get("/Resources", {}).get("/Font", {}) or {}
        fill = {name for name, ref in fonts.items()
                if name == "/FILLTXT" or ref.get_object().get("/BaseFont") == "/Helvetica"}
        identity = [1, 0, 0, 1, 0, 0]
        ctm, stack, tm, tlm, leading = identity, [], identity, identity, 0.0
        font, run = None, None
        for operands, op in ContentStream(page.get_contents(), reader).operations:
            if op == b"q":
                stack.append(ctm)
            elif op == b"Q":
                ctm = stack.pop() if stack else identity
            elif op == b"cm":
                ctm = mul([float(x) for x in operands], ctm)
            elif op == b"BT":
                tm = tlm = identity
                run = None
            elif op == b"Tf":
                font = operands[0]
            elif op == b"TL":
                leading = float(operands[0])
            elif op == b"Tm":
                tm = tlm = [float(x) for x in operands]
                run = None
            elif op in (b"Td", b"TD"):
                tx, ty = float(operands[0]), float(operands[1])
                if op == b"TD":
                    leading = -ty
                tm = tlm = mul([1, 0, 0, 1, tx, ty], tlm)
                run = None
            elif op == b"T*":
                tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm)
                if run is not None:
                    run["lines"].append("")
            elif op in (b"Tj", b"TJ", b"'"):
                s = text_of(operands, op)
                if not s.strip():
                    continue
                m = mul(tm, ctm)
                if font in fill:
                    if run is None:
                        run = {"page": page_no, "x": round(m[4], 1), "y": round(m[5], 1), "lines": [""]}
                        values.append(run)
                    run["lines"][-1] += s
                else:
                    labels.append({"page": page_no, "x": round(m[4], 1), "y": round(m[5], 1), "text": s.strip()})
    for v in values:
        v["lines"] = [line.strip() for line in v["lines"] if line.strip()]
    return {"values": [v for v in values if v["lines"]], "labels": labels}


if __name__ == "__main__":
    json.dump(read(sys.argv[1]), sys.stdout)
