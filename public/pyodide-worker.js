// Pyodide WebWorker — runs Python out of main thread.
// Loads Pyodide from the official CDN. Communicates with the host via postMessage.
//
// Incoming messages:
//   { type: 'init' }                          -> boot Pyodide, emit { type: 'ready' }
//   { type: 'run', id: string, code: string } -> execute code, emit stdout/stderr chunks
//                                                and one of { type: 'result'|'error' }.
//
// Outgoing messages:
//   { type: 'ready' }
//   { type: 'stdout', id, text }
//   { type: 'stderr', id, text }
//   { type: 'image',  id, mime, dataBase64 }     // matplotlib PNG(s)
//   { type: 'result', id, repr }                 // final value repr (or empty)
//   { type: 'error',  id, message }

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise = null;
let loadedPackages = new Set();

function post(msg) {
  self.postMessage(msg);
}

async function bootPyodide() {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    self.importScripts(`${PYODIDE_INDEX_URL}pyodide.js`);
    // `loadPyodide` is exposed on the worker global scope by pyodide.js
    const py = await self.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    // default packages : micropip for ad-hoc installs later
    await py.loadPackage(['micropip']);
    return py;
  })();
  return pyodidePromise;
}

async function ensurePackages(py, code) {
  // naive auto-detection of common scientific packages. We only load what we see.
  const need = new Set();
  const probe = {
    numpy: /\b(import\s+numpy|from\s+numpy\b)/,
    pandas: /\b(import\s+pandas|from\s+pandas\b)/,
    matplotlib: /\b(import\s+matplotlib|from\s+matplotlib\b|import\s+pylab)/,
    scipy: /\b(import\s+scipy|from\s+scipy\b)/,
    sympy: /\b(import\s+sympy|from\s+sympy\b)/,
  };
  for (const [pkg, re] of Object.entries(probe)) {
    if (re.test(code) && !loadedPackages.has(pkg)) need.add(pkg);
  }
  if (need.size > 0) {
    await py.loadPackage([...need]);
    for (const p of need) loadedPackages.add(p);
  }
}

async function runCode(id, code) {
  try {
    const py = await bootPyodide();
    await ensurePackages(py, code);

    // install matplotlib hook if matplotlib present → PNG back to host.
    const usesMpl = loadedPackages.has('matplotlib');

    // redirect stdout/stderr per-call.
    py.setStdout({
      batched: (s) => post({ type: 'stdout', id, text: s }),
    });
    py.setStderr({
      batched: (s) => post({ type: 'stderr', id, text: s }),
    });

    let result;
    if (usesMpl) {
      // force non-interactive backend, capture figures after user code.
      const wrapped = `
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as _cs_plt
import io, base64, json

_cs_user_result = None
try:
${code.split('\n').map((l) => '    ' + l).join('\n')}
except Exception as _cs_exc:
    import traceback
    traceback.print_exc()
    raise

_cs_figs = []
for _cs_num in _cs_plt.get_fignums():
    _cs_fig = _cs_plt.figure(_cs_num)
    _cs_buf = io.BytesIO()
    _cs_fig.savefig(_cs_buf, format='png', bbox_inches='tight', dpi=110)
    _cs_buf.seek(0)
    _cs_figs.append(base64.b64encode(_cs_buf.read()).decode('ascii'))
_cs_plt.close('all')
_cs_figs
`;
      const figsProxy = await py.runPythonAsync(wrapped);
      const figs = figsProxy?.toJs ? figsProxy.toJs() : figsProxy;
      if (Array.isArray(figs)) {
        for (const b64 of figs) {
          post({ type: 'image', id, mime: 'image/png', dataBase64: b64 });
        }
      }
      try { figsProxy?.destroy && figsProxy.destroy(); } catch {}
      result = undefined;
    } else {
      result = await py.runPythonAsync(code);
    }

    let repr = '';
    if (result !== undefined && result !== null) {
      try {
        repr = String(result);
      } catch {}
      try { result.destroy && result.destroy(); } catch {}
    }
    post({ type: 'result', id, repr });
  } catch (err) {
    post({ type: 'error', id, message: (err && err.message) || String(err) });
  }
}

self.onmessage = async (evt) => {
  const msg = evt.data || {};
  if (msg.type === 'init') {
    try {
      await bootPyodide();
      post({ type: 'ready' });
    } catch (err) {
      post({ type: 'error', id: 'init', message: (err && err.message) || String(err) });
    }
  } else if (msg.type === 'run') {
    runCode(msg.id, msg.code);
  }
};
