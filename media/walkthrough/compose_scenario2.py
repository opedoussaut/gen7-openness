# Composes a ~5-minute walkthrough of the live GEN7 Decision Intelligence interface from real step captures:
# a virtual camera moves to what is active, a spotlight dims the rest, and presenter captions explain each step.
import json, math, subprocess, sys, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
D = os.environ.get('WALK_DIR', '/tmp/walk')
F = lambda w, s: ImageFont.truetype(f'{D}/fonts/Inter-{w}.ttf', s)
from fontTools.ttLib import TTFont as _TT
INTER_CMAP = set(_TT(f'{D}/fonts/Inter-400.ttf')['cmap'].getBestCmap().keys())
def FB(w, s): return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans' + ('-Bold' if w >= 600 else '') + '.ttf', int(s * .92))
def runs(text):
    out = []
    for ch in text:
        ok = ord(ch) in INTER_CMAP
        if out and out[-1][1] == ok: out[-1][0] += ch
        else: out.append([ch, ok])
    return out
def tlen(d, text, font, w):
    return sum(d.textlength(t, font=font if ok else FB(w, font.size)) for t, ok in runs(text))
def draw(d, xy, text, font, w, fill):
    x, y = xy
    for t, ok in runs(text):
        f = font if ok else FB(w, font.size); dy = 0 if ok else font.size * .06
        d.text((x, y + dy), t, font=f, fill=fill); x += d.textlength(t, font=f)
ix = json.load(open(f'{D}/index.json'))
by = {(m['scene'], m.get('step')): m for m in ix}

# ---------- geometry of the orchestration SVG (viewBox 800 × 732), mapped to page coordinates ----------
OY = 282
GEO = {
    'owner': (400 - 82, 26, 164, 50), 'clusterops': (140 - 82, 26, 164, 50), 'facility': (660 - 82, 26, 164, 50),
    's1': (290, 130, 220, 46), 'gate': (305, 198, 190, 42), 'fast': (16, 198, 200, 42), 'triage': (0, 106, 800, 166),
    'orchestrator': (260, OY + 14, 280, 56),
    **{a: (x - 88, OY + 196, 176, 84) for a, x in [('deployment', 100), ('workload', 300), ('cooling', 500), ('sustainability', 700)]},
    **{s: (x - 69, OY + 382, 138, 54) for s, x in [('dcim', 80), ('power', 240), ('scheduler', 400), ('bms', 560), ('carbon', 720)]},
}
def node(m, nid):
    sx, sy, sw, sh = m['svg']; k = sw / 800
    x, y, w, h = GEO[nid]; return [sx + x * k, sy + y * k, w * k, h * k]
def U(*rs):
    rs = [r for r in rs if r]
    x0 = min(r[0] for r in rs); y0 = min(r[1] for r in rs); x1 = max(r[0] + r[2] for r in rs); y1 = max(r[1] + r[3] for r in rs)
    return [x0, y0, x1 - x0, y1 - y0]
def P(r, p): return [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p] if r else None

COL = {'s1': (31, 209, 165), 'a2a': (156, 124, 244), 'mcp': (70, 150, 235), 'human': (236, 168, 74), 'lean': (40, 190, 210),
       'bad': (240, 96, 96), 'ok': (60, 214, 150), 'neutral': (170, 190, 210)}
KIND = {'incident': ('THE REQUEST', 'neutral'), 'human': ('PEOPLE', 'human'), 'ingest': ('OBSERVE · 7 SYSTEMS', 'lean'), 'groom': ('GROOM · DETERMINISTIC', 'lean'),
        'decide': ('SYSTEM 1 · TRIAGE', 's1'), 'discover': ('MCP · DISCOVERY', 'mcp'), 'model': ('SYSTEM 2 · REASONING', 'a2a'), 'a2a': ('A2A · AGENT ↔ AGENT', 'a2a'),
        'mcp': ('MCP · GOVERNED SKILL', 'mcp'), 'decision': ('RECOMMENDATION', 'ok')}
detail = m_ = None
def narr(m): n = m['narration']; return n.split(' — ', 1)[1] if ' — ' in n else n

# ---------- presenter messages (overrides of the app's own narration at the key moments) ----------
OVR = {
    ('R-22', 0): ('1 · A ROUTINE REQUEST', 'R-22 — a 34 kW inference node on Loop B. Watch how little machinery a routine decision needs.', 'neutral'),
    ('R-22', 1): (None, 'The question: can Cooling Loop B take a 34 kW inference node on Thursday?', None),
    ('R-22', 3): (None, 'Seven facility systems are read: cooling, power, GPU telemetry, scheduler, DCIM, maintenance, grid carbon.', None),
    ('R-22', 10): ('RAW DATA', '11,825 records — about 760k tokens if we sent them to a model as they are.', 'lean'),
    ('R-22', 11): (None, 'Grooming is ordinary, deterministic code: filter, normalise, deduplicate, correlate, aggregate, rank.', None),
    ('R-22', 17): ('SYSTEM 1 · TRIAGE', 'A 1,772-parameter model, running in this browser in under a millisecond: risk LOW · reasoning NO · route DIRECT.', 's1'),
    ('R-22', '17b'): ('CONFIDENCE GATE', 'Every decision is at least 75 % confident → the fast path. System 2 is not engaged: no agents, no model calls.', 's1'),
    ('R-22', 18): ('FAST PATH', 'One governed skill of the Deployment competence, reached through MCP. No reasoning.', 's1'),
    ('R-22', 19): ('ACT · BOUNDED', 'The slot is reserved in DCIM — a reversible action, within delegated authority.', 's1'),
    ('R-22', 20): ('ACCOUNTABILITY', 'The Program Owner is informed and can reverse it. People stay accountable.', 'human'),
    ('R-22', 21): ('RESULT', 'Decided on the fast path: no reasoning model called, no A2A message. That is triage paying off.', 'ok'),
    ('R-17', 0): ('SCENARIO 2 · A COMPLEX REQUEST', 'R-17 — a 120 kW GB200 NVL72 rack, 72 GPUs, to install on Cooling Loop A on Thursday.', 'neutral'),
    ('R-17', 1): (None, 'The question: can Cooling Loop A take a new 120 kW AI rack on Thursday — safely?', None),
    ('R-17', 3): (None, 'Seven facility systems are read — cooling, power, GPUs, scheduler, DCIM, maintenance, grid carbon. Each lights up while its data is extracted.', None),
    ('R-17', 10): ('RAW DATA', '11,825 records, ≈760k tokens. Sending all of it to AI would cost the most and bury the signal.', 'lean'),
    ('R-17', 11): (None, 'Deterministic grooming first — no AI involved. Heat is computed from CDU flow × ΔT.', None),
    ('R-17', 16): ('LEAN', '99.6 % of the noise is removed before any AI reasons — 60 pieces of evidence remain. Measured.', 'lean'),
    ('R-17', 17): ('SYSTEM 1 · TRIAGE', 'A small model in this browser triages the request in under a millisecond: risk HIGH · reasoning YES · route ORCHESTRATE · all four specialists required.', 's1'),
    ('R-17', '17b'): ('CONFIDENCE GATE', 'Complex and multi-domain → escalate. The gate sends the request down into System 2, the specialised agents.', 'a2a'),
    ('R-17', 18): (None, 'Inside each agent, its own tools are discovered through MCP — private to the agent, not the open interface.', None),
    ('R-17', 23): ('SYSTEM 2 · ORCHESTRATOR', 'The orchestrator engages exactly the specialists System 1 selected.', 'a2a'),
    ('R-17', 24): (None, 'A2A — the open layer: each specialist receives a bounded task, not the raw data.', None),
    ('R-17', 30): (None, 'Deployment: space and power are fine. Cooling is not its call.', None),
    ('R-17', 35): (None, 'Cooling reads the measured Loop A heat — p95 over 24 hours, from CDU flow × ΔT.', None),
    ('R-17', 36): ('THE CLASH', 'Cooling’s deterministic check: 1000 − 869.1 − 144 = −13.1 kW. Loop A would overload.', 'bad'),
    ('R-17', '36c'): ('CLASH DETECTED', 'Deployment says proceed, Cooling says not as-is. Now watch how the orchestration reacts.', 'bad'),
    ('R-17', '38c'): ('REACTION 2 / 6', 'Cooling objects to the orchestrator — the disagreement is explicit, not hidden.', 'bad'),
    ('R-17', '39c'): ('REACTION 3 / 6', 'Cooling asks Workload to free at least 13.1 kW on Loop A — agent to agent, over A2A.', 'bad'),
    ('R-17', 43): (None, 'Workload finds the smallest safe change: checkpoint ft-sweep-17 and resume it on idle B-05 (Loop B).', None),
    ('R-17', '44c'): ('REACTION 4 / 6', 'Proposal: −38.7 kW on Loop A. Moving a job needs people — the agent asks.', 'bad'),
    ('R-17', 45): (None, 'Person to person: the Cluster Ops Lead and the Facility Manager agree on the timing.', None),
    ('R-17', '47c'): ('REACTION 5 / 6', 'Approved by the Cluster Ops Lead. The loop can continue.', 'bad'),
    ('R-17', 49): ('RE-CHECK', 'Cooling re-runs the same deterministic check with the released load. No rule is relaxed.', 'mcp'),
    ('R-17', '49c'): ('RESOLVED', '1000 − 869.1 + 38.7 − 144 = +25.6 kW. Loop A fits R-17 — verified, not argued.', 'ok'),
    ('R-17', 52): (None, 'The orchestrator consolidates the evidence and resolves the disagreement.', None),
    ('R-17', 53): (None, 'Agents recommend. People decide: approval requested from the Facility Manager.', None),
    ('R-17', 56): ('RECOMMENDATION', 'Deploy R-17 on Loop A on Thursday — after moving ft-sweep-17 to Loop B. Signed off by people.', 'ok'),
    ('R-17', 'tele'): ('TELEMETRY', 'Every model call, token, message and euro is recorded — measured, not guessed.', 'ok'),
}
SKIP_CAPTION_CHANGE = {('R-22', k) for k in [4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16]} | {('R-17', k) for k in [4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 19, 20, 21, 22]}

BASE = {'incident': 4.5, 'human': 3.6, 'ingest': 1.1, 'raw': 3.4, 'groom': 1.7, 'decide': 5.2, 'discover': 1.2, 'model': 2.8, 'a2a': 2.9, 'mcp': 3.0, 'decision': 5.5, 'idle': 4.2, 'clash': 3.6}

shots = []  # dict(img, target, holes, kicker, text, color, dur, chip)
def add(img, target, holes, kicker, text, color, dur, chip='', scene=None):
    shots.append(dict(img=img, target=target, holes=[h for h in holes if h], kicker=kicker, text=text, color=color, dur=dur, chip=chip, scene=scene))

def card(title, sub, dur, kicker=''):
    shots.append(dict(card=(kicker, title, sub), dur=dur))

# ---------- build the edit ----------
card('GEN7 · Decision Intelligence', 'Scenario 2 — a complex capacity decision, end to end, then what it saves at scale', 6.5, 'LIVE INTERFACE WALKTHROUGH')
step_shots = []
for key, label in [('R-17', 'Scenario 2 · R-17 complex request')]:
    steps = sorted([m for m in ix if m['scene'] == key and isinstance(m['step'], int)], key=lambda m: m['step'])
    total = steps[-1]['step']; prev_done = 0; last_caption = None
    for m in steps:
        k, n = m['kind'], m['step']
        chip = f'LIVE INTERFACE · {label}   ·   step {n} / {total}' if n else f'LIVE INTERFACE · {label}'
        ids = [i[2:] for i in m['activeIds']]
        if k in ('ingest', 'groom', 'decide', 'discover') or (k == 'human' and len(ids) > 2): ids = [i for i in ids if i != 'orchestrator'] or ids
        kicker, color = KIND.get(k, ('', 'neutral'))
        text = narr(m)
        if k == 'groom': kicker = f'GROOM · {m["nowTitle"].upper()}'
        o = OVR.get((key, n))
        if o: kicker = o[0] or kicker; text = o[1]; color = o[2] or color
        elif (key, n) in SKIP_CAPTION_CHANGE and last_caption: kicker, text, color = (kicker if k == 'groom' else last_caption[0]), last_caption[1], last_caption[2]
        if n == 0:
            add(m['file'], U(m['incident'], m['rail']), [m['incident']], kicker, text, color, BASE['idle'], chip, key)
        elif k == 'incident':
            add(m['file'], m['incident'], [m['incident'], m['gauge']], kicker, text, color, BASE['incident'], chip, key)
        elif k == 'ingest' and m['nowTitle'].endswith('scanned'):
            add(m['file'], U(m['sources'], m['raw']), [m['raw']], kicker if not o else o[0], text, color, BASE['raw'], chip, key)
        elif k == 'ingest':
            srv = [i for i in ids if i in GEO and i not in ('orchestrator',)]
            add(m['file'], U(m['sources'], m['raw']), [m['sources']], kicker, text, color, BASE['ingest'], chip, key)
        elif k == 'groom':
            last = m['nowTitle'].startswith('Rank')
            add(m['file'], U(m['funnel'], m['lean']) if last else U(m['raw'], m['funnel']), [m['funnel']] + ([m['lean']] if last else []), kicker, text, color, BASE['groom'] * (2.6 if last else 1), chip, key)
        elif k == 'decide':
            add(m['file'], m['s1'], [m['s1']], kicker, text, color, BASE['decide'], chip, key)
            o2 = OVR[(key, '17b')]
            add(m['file'], node(m, 'triage'), [node(m, 's1'), node(m, 'gate'), node(m, 'fast') if key == 'R-22' else U(node(m, 'gate'), node(m, 'orchestrator'))], o2[0], o2[1], o2[2], BASE['decide'], chip, key)
        elif k == 'discover':
            srv = [i for i in ids if i in ('dcim', 'power', 'scheduler', 'bms', 'carbon')]
            add(m['file'], U(*[node(m, s) for s in ('dcim', 'power', 'scheduler', 'bms', 'carbon')], node(m, 'deployment')), [node(m, s) for s in srv], kicker, text, color, BASE['discover'] * (2.2 if key == 'R-22' else 1), chip, key)
        elif k in ('human', 'a2a', 'mcp', 'model'):
            rs = [node(m, i) for i in ids if i in GEO]
            if not rs: rs = [m['canvas']]
            add(m['file'], U(*rs), rs, kicker, text, color, BASE[k] * (1.25 if o else 1), chip, key)
        elif k == 'decision':
            add(m['file'], m['rec'] or m['now'], [m['rec'] or m['now']], kicker, text, color, BASE['decision'], chip, key)
        last_caption = (kicker, text, color)
        # clash reaction: a dedicated shot on the clash panel each time a reaction step completes
        done = m.get('clashStepsDone', 0)
        if key == 'R-17' and m['clash'] and done > prev_done:
            ck = OVR.get((key, f'{n}c'))
            if ck:
                tgt = U(m['clash'], m['clashArc'], node(m, 'cooling')) if n == 36 else m['clash']
                holes = [m['clash'], m['clashArc']] + ([node(m, 'cooling'), node(m, 'deployment')] if n == 36 else [])
                add(m['file'], tgt, holes, ck[0], ck[1], ck[2], BASE['clash'] * (1.35 if n in (36, 49) else 1), chip, key)
                last_caption = (ck[0], ck[1], ck[2])
        prev_done = done
    end = by[(key, 'end')]
    if key == 'R-17':
        o = OVR[(key, 'tele')]
        add(end['file'], end['tele'], [end['tele']], o[0], o[1], o[2], 5.0, f'LIVE INTERFACE · {label}', key)


TB = {m['scene']: m for m in json.load(open(f'{D}/tabs.json'))}
S, EC, BU, EN = TB['story'], TB['economics'], TB['scale-bu'], TB['scale-ent']
def sub(r, a, b): x, y, w, h = r; return [x, y + h * a, w, h * (b - a)]
def rows(r, y0, y1): x, y, w, h = r; return [x, y + y0, w, y1 - y0]
card('What happened', 'The answer, in plain words — every number comes from the run', 3.6, 'THE STORY')
add(S['file'], S['blocks'][2], [S['blocks'][2]], 'FIVE QUESTIONS, ANSWERED', 'Right: every number calculated with physics and checked twice. Cheap: €0.0461. Fast: 16 s of computing. People in charge. Everything auditable.', 'ok', 8, 'THE STORY', 'tabs')
add(S['file'], sub(S['blocks'][3], 0, .55), [sub(S['blocks'][3], .30, .55)], 'ELEVEN STEPS', 'The Cooling specialist found Loop A about 13 kW short; Workload moved one low-priority job; Cooling re-did the same calculation — it fits.', 'bad', 8, 'THE STORY', 'tabs')
add(S['file'], S['blocks'][4], [S['blocks'][4]], 'THE RESULT', '“Yes, install it on Thursday 1 October — after moving one low-priority job to the other cooling circuit.”', 'ok', 7, 'THE STORY', 'tabs')
card('Was it worth it?', 'What it cost, what it was worth, and where the saving comes from', 3.6, 'AI ECONOMICS')
add(EC['file'], sub(EC['cost'], 0, .30), [sub(EC['cost'], .14, .30)], 'WHAT DID IT COST? · MEASURED', 'Telemetry works like a taxi meter: every call is recorded. This decision cost €0.0461 — 78 % of it writing answers and reasoning.', 'mcp', 8, 'AI ECONOMICS', 'tabs')
add(EC['file'], sub(EC['cost'], .30, 1), [sub(EC['cost'], .31, .86)], 'LINE BY LINE · ILLUSTRATIVE PRICES', 'Frontier model: 4 calls, €0.0352. Specialist model: 3 calls, €0.0053. Tools, messages and extraction: small fixed fees. Total: €0.0461.', 'mcp', 8, 'AI ECONOMICS', 'tabs')
add(EC['file'], sub(EC['value'], 0, .58), [sub(EC['value'], .14, .34)], 'WHAT WAS IT WORTH? · ESTIMATE', 'GPU capacity online three days earlier (€10,886) + engineering study time saved (€1,430) = €12,316 — estimated from visible assumptions, not measured.', 'human', 9, 'AI ECONOMICS', 'tabs')
sv = EC['savings']; k = sv[3] / 1840.7
cardA, cardB, cardC, table = rows(sv, 184 * k, 428 * k), rows(sv, 454 * k, 805 * k), rows(sv, 832 * k, 1190 * k), rows(sv, 1263 * k, 1822 * k)
add(EC['file'], U(rows(sv, 0, 150 * k), cardA), [cardA], 'WHERE THE SAVING COMES FROM · A', 'Brute force makes the AI read the equivalent of ≈1,139 pages for this decision. After grooming: ≈5 pages — 252× less, in 9 ms of ordinary computing.', 'lean', 9, 'AI ECONOMICS', 'tabs')
add(EC['file'], cardB, [cardB], 'B · READING AND WRITING HAVE A PRICE', 'The bill is tokens × price. Brute force: €1.51 for this one decision. Lean: €0.0461. Same agents, same questions, same decision.', 'lean', 8.5, 'AI ECONOMICS', 'tabs')
add(EC['file'], cardC, [cardC], 'C · THE SAVING IS THE DIFFERENCE', '€1.51 − €0.0461 = €1.46 saved on this one decision: 97 % less, and 3.1× faster (50 s → 16 s). Most of it from the Liquid Cooling Agent’s raw data.', 'ok', 9, 'AI ECONOMICS', 'tabs')
add(EC['file'], table, [table], 'FACTOR BY FACTOR', '252× less context · 101× fewer tokens · 33× lower cost · 3.1× faster · 22× less energy (indicative). The business decision is the same.', 'ok', 8.5, 'AI ECONOMICS', 'tabs')
add(EC['file'], EC['bridge'], [EC['bridge']], 'ONE DECISION → A BUDGET LINE', 'This was one decision. A business unit makes 146,000 a year: €1.46 × 146,000 = €214k of AI spend avoided — a projection, not a measurement.', 'ok', 8, 'AI ECONOMICS', 'tabs')
card('At scale', 'One decision is cents. Thousands a day is a budget.', 3.6, 'AT SCALE')
add(BU['file'], U(BU['presets'], BU['eq']), [BU['presets'], BU['eq']], 'BUSINESS UNIT · 5 SITES × 80 DECISIONS A DAY', '€1.46 saved per decision × 146,000 decisions a year = €214k of AI spend avoided every year, for the same decisions.', 'ok', 9, 'AT SCALE · PROJECTION', 'tabs')
add(BU['file'], BU['bills'], [BU['yb'], BU['cum']], 'THE YEARLY AI BILL', 'Brute force: €221k a year. Lean: €6,735 — 33× less. The saving accumulates month after month.', 'ok', 8.5, 'AT SCALE · PROJECTION', 'tabs')
add(BU['file'], BU['cards'], [BU['cards']], 'WHAT IT REPRESENTS', 'Every year: 165.7 million pages not read by AI, 1,380 hours of AI processing and 2,261 kWh of AI energy avoided (indicative).', 'ok', 8.5, 'AT SCALE · PROJECTION', 'tabs')
add(EN['file'], U(EN['presets'], EN['eq']), [EN['eq']], 'ENTERPRISE · 25 SITES × 300 DECISIONS A DAY', '2.7 million decisions a year × €1.46 = €4.01M of AI spend avoided per year.', 'ok', 8.5, 'AT SCALE · PROJECTION', 'tabs')
add(EN['file'], U(EN['yb'], EN['cards']), [EN['yb'], EN['cards']], 'ENTERPRISE · WHAT IT REPRESENTS', 'Brute force €4.14M vs lean €126k a year. 3.1 billion pages not read by AI; 25,869 hours of AI processing avoided.', 'ok', 8.5, 'AT SCALE · PROJECTION', 'tabs')
add(EN['file'], EN['ts'], [EN['ts']], 'WHY TELEMETRY MATTERS AT SCALE', 'Without telemetry you get a monthly bill. With it you run a budget: a unit cost per decision, drift caught the same day, value proven per euro.', 'mcp', 9, 'AT SCALE', 'tabs')
card('The right intelligence. At the right moment.', 'Groom · Decide · Reason · Act · Measure — simulated AI-factory scenario · illustrative figures', 7, 'GEN7')

# ---------- fit to the target length: scale the demo step shots only ----------
TARGET = float(sys.argv[1]) if len(sys.argv) > 1 else 300.0
fixed = sum(s['dur'] for s in shots if s.get('scene') != 'R-17')
var = sum(s['dur'] for s in shots if s.get('scene') == 'R-17')
k = (TARGET - fixed) / var
for s in shots:
    if s.get('scene') == 'R-17': s['dur'] *= k
print(f'{len(shots)} shots · step scale {k:.2f} · total {sum(s["dur"] for s in shots):.1f} s', flush=True)

# ---------- camera ----------
PAGE_W = 1600
def fit(r, page_h, minw=720):
    x, y, w, h = P(r, 40)
    cw = max(w, minw, h * 16 / 9 / 0.80)  # leave room for the caption band at the bottom
    cw = min(cw, PAGE_W); ch = cw * 9 / 16
    cx = x + w / 2; cy = y + h / 2
    cam_x = min(max(cx - cw / 2, 0), PAGE_W - cw)
    cam_y = min(max(cy - ch * 0.44, 0), max(0, page_h - ch))
    return np.array([cam_x, cam_y, cw, ch])
for s in shots:
    if 'card' in s: continue
    s['page_h'] = Image.open(f'{D}/shots/{s["img"]}').size[1] / 2
    s['cam'] = fit(s['target'], s['page_h'])

# ---------- images ----------
cache = {}
def load(name):
    if name not in cache:
        if len(cache) > 4: cache.pop(next(iter(cache)))
        full = cv2.imread(f'{D}/shots/{name}', cv2.IMREAD_COLOR)
        half = cv2.resize(full, (full.shape[1] // 2, full.shape[0] // 2), interpolation=cv2.INTER_AREA)
        cache[name] = (full, half)
    return cache[name]
def view(name, cam):
    full, half = load(name)
    x, y, w, h = cam; s = W / w  # output px per css px
    src, k = (full, 2.0) if s > 1.5 else (half, 1.0)
    a = s / k
    M = np.float32([[a, 0, -x * k * a], [0, a, -y * k * a]])
    return cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LINEAR if a >= 1 else cv2.INTER_AREA if False else cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(245, 247, 250))

def mask_for(holes, cam):
    x, y, w, h = cam; s = W / w
    m = np.zeros((H // 4, W // 4), np.float32)
    for hx, hy, hw, hh in holes:
        x0 = int(((hx - 10 - x) * s) / 4); y0 = int(((hy - 10 - y) * s) / 4); x1 = int(((hx + hw + 10 - x) * s) / 4); y1 = int(((hy + hh + 10 - y) * s) / 4)
        cv2.rectangle(m, (x0, y0), (x1, y1), 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), 5)
    return cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR)[..., None]

def outline(img, holes, cam, color, alpha):
    if alpha <= 0.01: return img
    x, y, w, h = cam; s = W / w; ov = img.copy()
    for hx, hy, hw, hh in holes:
        p0 = (int((hx - 10 - x) * s), int((hy - 10 - y) * s)); p1 = (int((hx + hw + 10 - x) * s), int((hy + hh + 10 - y) * s))
        cv2.rectangle(ov, p0, p1, color[::-1], 3, lineType=cv2.LINE_AA)
    return cv2.addWeighted(ov, alpha, img, 1 - alpha, 0)

# ---------- overlays ----------
def rgba_caption(kicker, text, color):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    fk, ft = F(700, 22), F(400, 38)
    words = text.split(); lines = []; cur = ''
    for wd in words:
        t = (cur + ' ' + wd).strip()
        if tlen(d, t, ft, 400) > 1560: lines.append(cur); cur = wd
        else: cur = t
    lines.append(cur)
    bh = 70 + 50 * len(lines); y0 = H - bh - 36
    d.rounded_rectangle((60, y0, W - 60, H - 36), 22, fill=(8, 18, 30, 222))
    d.rounded_rectangle((60, y0, 68, H - 36), 4, fill=color + (255,))
    draw(d, (96, y0 + 22), kicker, fk, 700, color + (255,))
    for i, ln in enumerate(lines): draw(d, (96, y0 + 58 + i * 50), ln, ft, 400, (240, 246, 252, 255))
    return np.array(im)
def rgba_chip(txt):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im); f = F(700, 18)
    tw = tlen(d, txt, f, 700); d.rounded_rectangle((40, 32, 40 + tw + 56, 72), 20, fill=(8, 18, 30, 210))
    d.ellipse((58, 46, 70, 58), fill=(240, 80, 80, 255)); draw(d, (82, 41), txt, f, 700, (225, 236, 246, 255))
    return np.array(im)
def rgba_card(kicker, title, sub):
    im = Image.new('RGB', (W, H), (4, 10, 20)); arr = np.array(im).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]; g = np.exp(-(((xx - W / 2) / 900) ** 2 + ((yy - H * .55) / 520) ** 2))
    arr += g[..., None] * np.array([14, 44, 78]); im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    fk, ft, fs = F(700, 24), F(700 if len(title) < 32 else 600, 88 if len(title) < 32 else 64), F(300, 34)
    for txt, f, y, c in [(kicker, fk, 400, (31, 209, 165)), (title, ft, 500, (238, 246, 252)), (sub, fs, 610, (170, 205, 230))]:
        tw = tlen(d, txt, f, 700); draw(d, ((W - tw) / 2, y - f.size / 2), txt, f, 700, c)
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
def blend_rgba(img, ov, a=1.0):
    if a <= 0.003: return img
    al = ov[..., 3:4].astype(np.float32) / 255 * a
    return (img.astype(np.float32) * (1 - al) + ov[..., [2, 1, 0]].astype(np.float32) * al).astype(np.uint8)

eio = lambda k: 4 * k ** 3 if k < .5 else 1 - (-2 * k + 2) ** 3 / 2
ovcache = {}
def ov(key, fn):
    if key not in ovcache:
        if len(ovcache) > 12: ovcache.pop(next(iter(ovcache)))
        ovcache[key] = fn()
    return ovcache[key]

def frame_of(i, u):
    s = shots[i]; prev = shots[i - 1] if i else None
    if 'card' in s:
        img = ov(('card', i), lambda: rgba_card(*s['card']))
        if prev is not None and u < .6 and 'card' not in prev:
            return cv2.addWeighted(img, eio(u / .6), frame_of(i - 1, prev['dur']), 1 - eio(u / .6), 0)
        return img
    drift = 1 - 0.035 * min(1, u / s['dur'])
    def cam_at(sh, uu):
        c = sh['cam'].copy(); d = 1 - 0.035 * min(1, uu / sh['dur']); cx, cy = c[0] + c[2] / 2, c[1] + c[3] * .44
        c[2] *= d; c[3] *= d; c[0] = cx - c[2] / 2; c[1] = cy - c[3] * .44; return c
    cam = cam_at(s, u)
    move = 1.1
    if prev is not None and 'card' not in prev and u < move and prev['img'].split('-')[0] == s['img'].split('-')[0]:
        e = eio(u / move); cam = cam_at(prev, prev['dur']) * (1 - e) + cam * e
    img = view(s['img'], cam)
    if prev is not None and 'card' not in prev and prev['img'] != s['img'] and u < .35:
        img = cv2.addWeighted(img, u / .35, view(prev['img'], cam), 1 - u / .35, 0)
    # spotlight
    m = mask_for(s['holes'], cam)
    if prev is not None and 'card' not in prev and u < .5 and prev['img'].split('-')[0] == s['img'].split('-')[0]:
        e = eio(u / .5); m = mask_for(prev['holes'], cam) * (1 - e) + m * e
    elif prev is None or 'card' in prev:
        m = 1 - (1 - m) * eio(min(1, u / .8))
    dim = 0.60
    img = (img.astype(np.float32) * (1 - dim * (1 - m)) + np.array([30, 18, 8], np.float32) * dim * (1 - m) * 0.25).astype(np.uint8)
    img = outline(img, s['holes'], cam, COL.get(s['color'], COL['neutral']), 0.55 * min(1, u / .5))
    # overlays
    capk = (s['kicker'], s['text'], s['color'])
    cap = ov(('cap',) + capk, lambda: rgba_caption(s['kicker'] or '', s['text'], COL.get(s['color'], COL['neutral'])))
    same = prev is not None and 'card' not in prev and (prev['kicker'], prev['text'], prev['color']) == capk
    a = 1 if same else eio(min(1, u / .35))
    if not same and prev is not None and 'card' not in prev and u < .35:
        img = blend_rgba(img, ov(('cap', prev['kicker'], prev['text'], prev['color']), lambda: rgba_caption(prev['kicker'] or '', prev['text'], COL.get(prev['color'], COL['neutral']))), 1 - a)
    img = blend_rgba(img, cap, a)
    if s['chip']: img = blend_rgba(img, ov(('chip', s['chip']), lambda: rgba_chip(s['chip'])))
    if prev is not None and 'card' in prev and u < .6:
        img = cv2.addWeighted(img, eio(u / .6), ov(('card', i - 1), lambda: rgba_card(*prev['card'])), 1 - eio(u / .6), 0)
    return img

if __name__ == '__main__':
    out = sys.argv[2] if len(sys.argv) > 2 else f'{D}/walk-silent.mp4'
    only = sys.argv[3] if len(sys.argv) > 3 else None  # 'preview' → a few stills
    starts = np.cumsum([0] + [s['dur'] for s in shots])
    total = starts[-1]; n = int(total * FPS)
    if only == 'preview':
        for t in [float(x) for x in sys.argv[4:]]:
            i = int(np.searchsorted(starts, t, side='right') - 1); cv2.imwrite(f'{D}/pv_{t:06.1f}.jpg', frame_of(i, t - starts[i]), [cv2.IMWRITE_JPEG_QUALITY, 85])
        sys.exit()
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for f in range(int(os.environ.get('START_FRAME', '0')), n):
        t = f / FPS; i = int(np.searchsorted(starts, t, side='right') - 1)
        ff.stdin.write(frame_of(i, t - starts[i]).tobytes())
        if f % 600 == 0: print('frame', f, '/', n, flush=True)
    ff.stdin.close(); ff.wait()
    json.dump([{'start': float(starts[i]), 'dur': s['dur'], 'kicker': s.get('kicker') or (s.get('card') or [''])[0], 'text': s.get('text') or ' · '.join((s.get('card') or ['', '', ''])[1:])} for i, s in enumerate(shots)], open(f'{D}/timeline.json', 'w'), indent=1)
    print('done', total)
