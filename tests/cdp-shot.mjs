// 以 Chrome DevTools Protocol 自動截圖與收集 console（開發驗證用）
// 用法：node tests/cdp-shot.mjs <url> <outDir> [scriptFile]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';

const [url, outDir, scriptFile] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = `${outDir}/chrome-prof`;
rmSync(prof, { recursive: true, force: true });
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn(CH, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(200);
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name, w = 1440, h = 900, mobile = false) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await sleep(600);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
const key = async (k, code, down = true) => send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: k === ' ' ? 32 : k.toUpperCase().charCodeAt(0) });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(6000);
const ctx = { send, evalJs, shot, sleep, key, logs };
if (scriptFile) {
  const fn = new Function('ctx', `return (async () => { const {send, evalJs, shot, sleep, key, logs} = ctx; ${readFileSync(scriptFile, 'utf8')} })()`);
  await fn(ctx);
} else {
  await shot('default');
}
writeFileSync(`${outDir}/console.log`, logs.join('\n'));
console.log(logs.slice(0, 40).join('\n'));
chrome.kill();
process.exit(0);
