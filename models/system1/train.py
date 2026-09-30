"""
GEN7 · SYSTEM 1 decision model — reproducible training and export.

A small multi-head MLP maps nine groomed features (see src/system1/features.js) to four typed decisions:
  capacity_risk        LOW / MEDIUM / HIGH                    (softmax)
  reasoning_required   NO / YES                               (softmax)
  preferred_route      DIRECT / ORCHESTRATE / HUMAN_REVIEW    (softmax)
  agents_required      WORKLOAD, COOLING, SUSTAINABILITY, DEPLOYMENT (independent sigmoids)

Training data: synthetic situations sampled over plausible ranges and labelled by the site planning
rules written below (label()). The model distils those rules into a fast, bounded function; 2 % of
labels are flipped to keep it from memorising exact thresholds. Nothing here is customer data.

Run:  python3 models/system1/train.py      (numpy + onnx; writes the files next to this script)
"""
import json, hashlib, os
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper
from onnx.reference import ReferenceEvaluator

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 7
FEATURES = ['request_load', 'loop_utilisation', 'cooling_margin', 'row_power', 'flexible_load', 'critical_load', 'recent_alarms', 'carbon', 'evidence_complete']
RISK = ['LOW', 'MEDIUM', 'HIGH']; REASON = ['NO', 'YES']; ROUTE = ['DIRECT', 'ORCHESTRATE', 'HUMAN_REVIEW']; AGENTS = ['WORKLOAD', 'COOLING', 'SUSTAINABILITY', 'DEPLOYMENT']

RULES = [
  'capacity_risk = HIGH if cooling_margin < 0.02 or row_power > 1.0; MEDIUM if cooling_margin < 0.12 or row_power > 0.92 or recent_alarms >= 0.66; else LOW',
  'reasoning_required = YES if capacity_risk != LOW or evidence_complete < 0.9 or (recent_alarms >= 0.33 and cooling_margin < 0.2); else NO',
  'preferred_route = HUMAN_REVIEW if evidence_complete < 0.75 or cooling_margin + flexible_load < 0 (moving flexible load cannot restore headroom); ORCHESTRATE if reasoning_required; else DIRECT',
  'agents_required (only when ORCHESTRATE): COOLING if cooling_margin < 0.12 or recent_alarms >= 0.33; WORKLOAD if cooling_margin < 0.02 and flexible_load > 0.005; DEPLOYMENT if row_power > 0.85 or request_load > 0.08; SUSTAINABILITY if request_load > 0.08 or carbon > 0.4'
]

def label(x):
    a, u, m, rp, flex, crit, al, co, ev = x
    risk = 2 if (m < 0.02 or rp > 1.0) else 1 if (m < 0.12 or rp > 0.92 or al >= 0.66) else 0
    reason = 1 if (risk != 0 or ev < 0.9 or (al >= 0.33 and m < 0.2)) else 0
    route = 2 if (ev < 0.75 or m + flex < 0) else 1 if reason else 0
    ag = [0, 0, 0, 0]
    if route == 1:
        ag = [int(m < 0.02 and flex > 0.005), int(m < 0.12 or al >= 0.33), int(a > 0.08 or co > 0.4), int(rp > 0.85 or a > 0.08)]
    return risk, reason, route, ag

def sample(n, rng):
    X = np.zeros((n, 9), np.float32)
    for i in range(n):
        if rng.random() < 0.35:   # dense sampling around real operating points (tight loops, big racks)
            a = rng.uniform(0.02, 0.2); u = rng.uniform(0.7, 0.95)
        else:
            a = rng.uniform(0.005, 0.25); u = rng.uniform(0.2, 1.0)
        m = 1 - u - a
        rp = rng.uniform(0.4, 1.05)
        flex = rng.uniform(0, min(0.2, u)); crit = rng.uniform(0, max(0.0, u - flex) * 0.5)
        al = rng.choice([0, 1/3, 2/3, 1], p=[0.55, 0.25, 0.12, 0.08])
        co = rng.uniform(0.15, 0.8)
        ev = rng.choice([1, 6/7, 5/7, 4/7], p=[0.82, 0.1, 0.05, 0.03])
        X[i] = [a, u, m, rp, flex, crit, al, co, ev]
    return X

def encode(X, rng, noise=0.02):
    n = len(X); Y = np.zeros((n, 12), np.float32); raw = []
    for i, x in enumerate(X):
        risk, reason, route, ag = label(x)
        if rng.random() < noise: risk = int(rng.integers(3))
        if rng.random() < noise: reason = 1 - reason
        if rng.random() < noise: route = int(rng.integers(3))
        Y[i, risk] = 1; Y[i, 3 + reason] = 1; Y[i, 5 + route] = 1; Y[i, 8:12] = ag
        raw.append((risk, reason, route, ag))
    return Y

def softmax(z): z = z - z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)
sigmoid = lambda z: 1 / (1 + np.exp(-np.clip(z, -60, 60)))

def forward(P, X):
    h0 = (X - P['mean']) / P['std']
    h1 = np.maximum(0, h0 @ P['W1'] + P['b1']); h2 = np.maximum(0, h1 @ P['W2'] + P['b2'])
    z = h2 @ P['W3'] + P['b3']
    return h0, h1, h2, z

def heads(z):
    return softmax(z[:, 0:3]), softmax(z[:, 3:5]), softmax(z[:, 5:8]), sigmoid(z[:, 8:12])

def train():
    rng = np.random.default_rng(SEED)
    Xtr, Xte = sample(9000, rng), sample(2000, rng)
    Ytr, Yte = encode(Xtr, rng), encode(Xte, rng, noise=0.0)
    H = 32
    P = {'mean': Xtr.mean(0), 'std': Xtr.std(0) + 1e-6,
         'W1': rng.normal(0, np.sqrt(2 / 9), (9, H)).astype(np.float32), 'b1': np.zeros(H, np.float32),
         'W2': rng.normal(0, np.sqrt(2 / H), (H, H)).astype(np.float32), 'b2': np.zeros(H, np.float32),
         'W3': rng.normal(0, np.sqrt(1 / H), (H, 12)).astype(np.float32), 'b3': np.zeros(12, np.float32)}
    keys = ['W1', 'b1', 'W2', 'b2', 'W3', 'b3']
    m = {k: np.zeros_like(P[k]) for k in keys}; v = {k: np.zeros_like(P[k]) for k in keys}
    lr, b1, b2, t = 3e-3, 0.9, 0.999, 0
    for epoch in range(160):
        idx = rng.permutation(len(Xtr))
        for s in range(0, len(idx), 256):
            B = idx[s:s + 256]; X, Y = Xtr[B], Ytr[B]
            h0, h1, h2, z = forward(P, X)
            pr, pa, pt, pg = heads(z)
            dz = np.zeros_like(z)
            dz[:, 0:3] = pr - Y[:, 0:3]; dz[:, 3:5] = pa - Y[:, 3:5]; dz[:, 5:8] = pt - Y[:, 5:8]; dz[:, 8:12] = pg - Y[:, 8:12]
            dz /= len(B)
            g = {'W3': h2.T @ dz, 'b3': dz.sum(0)}
            d2 = (dz @ P['W3'].T) * (h2 > 0); g['W2'] = h1.T @ d2; g['b2'] = d2.sum(0)
            d1 = (d2 @ P['W2'].T) * (h1 > 0); g['W1'] = h0.T @ d1; g['b1'] = d1.sum(0)
            t += 1
            for k in keys:
                m[k] = b1 * m[k] + (1 - b1) * g[k]; v[k] = b2 * v[k] + (1 - b2) * g[k] ** 2
                P[k] -= lr * (m[k] / (1 - b1 ** t)) / (np.sqrt(v[k] / (1 - b2 ** t)) + 1e-8)
        if epoch == 110: lr = 1e-3
    for k in P: P[k] = P[k].astype(np.float32)
    # holdout metrics (noise-free labels)
    _, _, _, z = forward(P, Xte); pr, pa, pt, pg = heads(z)
    acc = lambda p, a, b: float((p.argmax(1) == Yte[:, a:b].argmax(1)).mean())
    agents_exact = float(((pg > 0.5).astype(int) == Yte[:, 8:12]).all(1).mean())
    metrics = {'holdout_samples': len(Xte), 'capacity_risk_accuracy': acc(pr, 0, 3), 'reasoning_required_accuracy': acc(pa, 3, 5), 'preferred_route_accuracy': acc(pt, 5, 8), 'agents_required_exact_match': agents_exact}
    return P, metrics, len(Xtr)

def export_onnx(P, path):
    init = [numpy_helper.from_array(P['mean'], 'mean'), numpy_helper.from_array(P['std'], 'std')]
    for k in ['W1', 'b1', 'W2', 'b2', 'W3', 'b3']: init.append(numpy_helper.from_array(P[k], k))
    for name, (a, b) in {'s_risk': (0, 3), 's_reason': (3, 5), 's_route': (5, 8), 's_agents': (8, 12)}.items():
        init += [numpy_helper.from_array(np.array([a], np.int64), f'{name}_start'), numpy_helper.from_array(np.array([b], np.int64), f'{name}_end'), numpy_helper.from_array(np.array([1], np.int64), f'{name}_axis')]
    N = [
        helper.make_node('Sub', ['features', 'mean'], ['x0']), helper.make_node('Div', ['x0', 'std'], ['x1']),
        helper.make_node('Gemm', ['x1', 'W1', 'b1'], ['g1']), helper.make_node('Relu', ['g1'], ['h1']),
        helper.make_node('Gemm', ['h1', 'W2', 'b2'], ['g2']), helper.make_node('Relu', ['g2'], ['h2']),
        helper.make_node('Gemm', ['h2', 'W3', 'b3'], ['logits'])]
    outs = []
    for name, op, out in [('s_risk', 'Softmax', 'capacity_risk'), ('s_reason', 'Softmax', 'reasoning_required'), ('s_route', 'Softmax', 'preferred_route'), ('s_agents', 'Sigmoid', 'agents_required')]:
        N.append(helper.make_node('Slice', ['logits', f'{name}_start', f'{name}_end', f'{name}_axis'], [f'{name}_z']))
        N.append(helper.make_node(op, [f'{name}_z'], [out], **({'axis': 1} if op == 'Softmax' else {})))
        outs.append(helper.make_tensor_value_info(out, TensorProto.FLOAT, ['N', {'capacity_risk': 3, 'reasoning_required': 2, 'preferred_route': 3, 'agents_required': 4}[out]]))
    g = helper.make_graph(N, 'gen7_system1_decision', [helper.make_tensor_value_info('features', TensorProto.FLOAT, ['N', 9])], outs, init)
    model = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)], producer_name='gen7-system1-train')
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, path)
    return model

if __name__ == '__main__':
    P, metrics, n_train = train()
    onnx_path = os.path.join(HERE, 'decision-mlp.onnx')
    export_onnx(P, onnx_path)
    # verify: ONNX reference runtime == numpy forward, on the demo requests and random points
    R17 = [0.144, 0.869, -0.013, 0.942, 0.039, 0.118, 0.333, 0.236, 1]
    R22 = [0.041, 0.484, 0.475, 0.683, 0.071, 0.0, 0.0, 0.236, 1]
    probe = np.vstack([np.array([R17, R22], np.float32), sample(6, np.random.default_rng(99))])
    ref = ReferenceEvaluator(onnx_path)
    o = ref.run(None, {'features': probe})
    _, _, _, z = forward(P, probe); n = heads(z)
    maxdiff = max(float(np.abs(a - b).max()) for a, b in zip(o, n))
    assert maxdiff < 1e-5, maxdiff
    params = sum(P[k].size for k in ['W1', 'b1', 'W2', 'b2', 'W3', 'b3'])
    weights = {'features': FEATURES, 'mean': P['mean'].tolist(), 'std': P['std'].tolist(),
               'layers': [{'W': P['W1'].tolist(), 'b': P['b1'].tolist(), 'act': 'relu'}, {'W': P['W2'].tolist(), 'b': P['b2'].tolist(), 'act': 'relu'}, {'W': P['W3'].tolist(), 'b': P['b3'].tolist(), 'act': 'none'}],
               'heads': {'capacity_risk': {'slice': [0, 3], 'act': 'softmax', 'labels': RISK}, 'reasoning_required': {'slice': [3, 5], 'act': 'softmax', 'labels': REASON}, 'preferred_route': {'slice': [5, 8], 'act': 'softmax', 'labels': ROUTE}, 'agents_required': {'slice': [8, 12], 'act': 'sigmoid', 'labels': AGENTS}}}
    json.dump(weights, open(os.path.join(HERE, 'decision-mlp.weights.json'), 'w'))
    golden = {'inputs': probe.tolist(), 'outputs': {k: v.tolist() for k, v in zip(['capacity_risk', 'reasoning_required', 'preferred_route', 'agents_required'], o)}}
    json.dump(golden, open(os.path.join(HERE, 'golden.json'), 'w'))
    raw = open(onnx_path, 'rb').read()
    card = {'name': 'GEN7 System 1 · capacity decision model', 'version': '1.0.0', 'architecture': 'MLP 9 → 32 → 32 → 12 (ReLU), four heads', 'parameters': int(params),
            'onnx': {'file': 'decision-mlp.onnx', 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'opset': 17},
            'inputs': FEATURES, 'outputs': {'capacity_risk': RISK, 'reasoning_required': REASON, 'preferred_route': ROUTE, 'agents_required': AGENTS},
            'training': {'samples': n_train, 'generator': 'synthetic situations over plausible ranges, labelled by the planning rules below', 'label_noise': 0.02, 'rules': RULES, 'seed': SEED, 'optimizer': 'Adam, 160 epochs, batch 256'},
            'holdout': metrics, 'onnx_vs_numpy_max_abs_diff': maxdiff,
            'scope': 'Bounded capacity decisions for the GEN7 AI-factory demonstrator. Not a general model; illustrative rules, not a site standard.'}
    json.dump(card, open(os.path.join(HERE, 'model-card.json'), 'w'), indent=2)
    js = os.path.join(HERE, '..', '..', 'src', 'system1', 'weights.js')
    open(js, 'w').write('// GENERATED by models/system1/train.py — same weights as models/system1/decision-mlp.onnx (parity is tested).\n// Used by the pure-JavaScript evaluator (Node tests, reference runs, labelled fallback).\nexport const WEIGHTS = ' + json.dumps(weights, separators=(',', ':')) + ';\nexport const MODEL_CARD = ' + json.dumps(card, separators=(',', ':')) + ';\n')
    print(json.dumps({'params': int(params), 'bytes': len(raw), **metrics, 'maxdiff': maxdiff}, indent=1))
    print('R-17', [np.round(h[0], 3).tolist() for h in n]); print('R-22', [np.round(h[1], 3).tolist() for h in n])
