#!/usr/bin/env python3
"""Proof XOR harness for darkstr 0048 cookie firewall (independent of Builder's rck48.py).
usage: xor48.py <config> <outdir>
env: XOR_BIN (librewolf binary), XOR_LAN (non-loopback IPv4 of this Mac, for insecure-origin Secure tests;
     "auto" = IPv4 of the default-route interface; a non-IP name = network.dns.localDomains stand-in -> 127.0.0.1)
     XOR_SB (Seatbelt profile; its "localhost" rule also matches this Mac's own interface addresses, so a real
     own-LAN-IP origin works inside the loopback-only sandbox while other LAN hosts and the internet stay blocked)
     XOR_F1=<docs> F1 stress; XOR_F1_FPD fetches/doc; XOR_F1_LAN_ONLY=1 puts every F1 document on the real LAN origin
     XOR_CENSUS=0 disables the chrome hook census attached to each page step (default on; see grade48r2.hook_state)
Disposable mktemp profile; local fixture served on localhost / 127.0.0.1 / [::1] / LAN IP; only kills the browser PID it started."""
import http.server, json, os, socket, subprocess, sys, tempfile, threading, time, urllib.parse, shutil
from pathlib import Path
CFG, OUT = sys.argv[1], Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
OUTNAME = os.environ.get('XOR_TAG', CFG)
BIN = os.environ['XOR_BIN']; LAN = os.environ.get('XOR_LAN', '')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xor48r2_net as _net  # noqa: E402
_is_ipv4 = _net.is_ipv4
def _auto_lan():
    """IPv4 of the default-route interface (macOS: route + ipconfig); must be bindable, i.e. this host's own address."""
    r = subprocess.run(['route', '-n', 'get', 'default'], capture_output=True, text=True).stdout
    ifc = next((l.split(':', 1)[1].strip() for l in r.splitlines() if l.strip().startswith('interface:')), '')
    ip = subprocess.run(['ipconfig', 'getifaddr', ifc], capture_output=True, text=True).stdout.strip() if ifc else ''
    return ip
if LAN == 'auto': LAN = _auto_lan()
LAN_REAL = _is_ipv4(LAN)
if LAN_REAL:
    with socket.socket() as _s: _s.bind((LAN, 0))  # raises unless LAN is one of this host's own addresses
LOOPBACK_HOSTS = _net.LOOPBACK_HOSTS
SELF_HOSTS = LOOPBACK_HOSTS | ({LAN, '::ffff:' + LAN} if LAN_REAL else set())
SRV_LOG = []; LK = threading.Lock()

PAGE = r'''<!doctype html><meta charset="utf-8"><title>XOR48</title><body>xor48 fixture<script>
window.__qa=window.__qa||{};
window.nap=ms=>new Promise(r=>setTimeout(r,ms));
window.enc=encodeURIComponent;
window.hk=(d)=>{try{const x=Object.getOwnPropertyDescriptor(d||document,'cookie');return x?((x.get&&x.get.name)||'own-noget'):null}catch(e){return 'err:'+e}};
window.addFrame=(src,opt)=>new Promise(r=>{const f=document.createElement('iframe');let done=false;const fin=()=>{if(done)return;done=true;setTimeout(()=>r(f),400)};
  if(opt&&opt.srcdoc!=null){f.onload=fin;f.srcdoc=opt.srcdoc;document.body.append(f);}
  else if(src){f.onload=fin;f.src=src;document.body.append(f);}
  else{document.body.append(f);fin();}
  setTimeout(fin,8000);});
let __id=0;
window.ask=(w,code)=>new Promise(res=>{const id='q'+(++__id)+'_'+Math.random();const t=setTimeout(()=>{removeEventListener('message',l);res({askTimeout:true})},10000);
  const l=e=>{if(e.data&&e.data.qaId===id){clearTimeout(t);removeEventListener('message',l);res(e.data.result)}};addEventListener('message',l);w.postMessage({qaEval:code,id},'*');});
addEventListener('message',async e=>{if(!e.data||!e.data.qaEval)return;let result;try{result=await (new Function('return (async()=>{'+e.data.qaEval+'\n})()'))();}catch(err){result={exception:String(err)}}
  try{e.source.postMessage({qaId:e.data.id,result},'*')}catch(err){}});
window.echo=async(u,o)=>{try{const r=await fetch(u,o||{});const t=await r.text();try{return JSON.parse(t)}catch(e){return {status:r.status,type:r.type}}}catch(e){return {err:String(e)}}};
window.cs=async(name)=>{try{if(!window.cookieStore)return 'n/a';if(name){const c=await cookieStore.get(name);return c?c.name+'='+c.value:null}return (await cookieStore.getAll()).map(c=>c.name+'='+c.value)}catch(e){return 'err:'+e}};
</script>'''

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def _foreign(self):
        """The fixture binds :: (all interfaces) so the LAN origin works; refuse any client that is not this host."""
        c = (self.client_address or ('',))[0]
        if c in SELF_HOSTS: return False
        with LK: SRV_LOG.append({'ts': time.time(), 'rejectedClient': c, 'path': self.path, 't': ''})
        self.send_response(403); self.send_header('Content-Length', '0'); self.end_headers(); return True
    def _rec(self, method):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        rec = {'ts': time.time(), 'method': method, 'host': self.headers.get('Host'), 'path': u.path, 'query': u.query,
               't': q.get('t', [''])[0], 'cookie': self.headers.get('Cookie', ''), 'ua': self.headers.get('User-Agent', ''),
               'sfs': self.headers.get('Sec-Fetch-Site', ''), 'sfm': self.headers.get('Sec-Fetch-Mode', ''), 'sfd': self.headers.get('Sec-Fetch-Dest', '')}
        with LK: SRV_LOG.append(rec)
        return u, q, rec
    def _send(self, code, ct, body, extra):
        d = body.encode(); self.send_response(code)
        self.send_header('Content-Type', ct); self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(d)))
        for k, v in extra: self.send_header(k, v)
        self.end_headers(); self.wfile.write(d)
    def do_POST(self):
        if self._foreign(): return
        n = int(self.headers.get('Content-Length') or 0)
        if n: self.rfile.read(n)
        u, q, rec = self._rec('POST'); self._send(200, 'text/html', PAGE, [])
    def do_GET(self):
        if self._foreign(): return
        u, q, rec = self._rec('GET'); p = u.path
        extra = [('Set-Cookie', c) for c in q.get('c', [])]
        if p.startswith('/redir'):
            extra.append(('Location', q.get('to', ['/echo'])[0])); self._send(302, 'text/plain', 'redirect', extra); return
        if p.endswith('/echo'):
            self._send(200, 'application/json', json.dumps(rec), extra); return
        if p == '/set':
            self._send(200, 'text/plain', 'ok', extra); return
        if p == '/favicon.ico':
            self._send(404, 'text/plain', 'nf', []); return
        self._send(200, 'text/html', PAGE, extra)

class S6(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6
    daemon_threads = True
    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0); super().server_bind()
srv = S6(('::', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start(); P = srv.server_port
A = f'http://localhost:{P}'; B = f'http://127.0.0.1:{P}'; C = f'http://[::1]:{P}'; D = f'http://{LAN}:{P}' if LAN else ''
def X(js): return js.replace('%A%', A).replace('%B%', B).replace('%C%', C).replace('%D%', D)
def srvlog(tag):
    with LK: return [dict(r) for r in SRV_LOG if r['t'] == tag]

def free_port():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]

class M:
    def __init__(s, port):
        dl = time.monotonic() + 60
        while True:
            try: s.sock = socket.create_connection(('127.0.0.1', port), timeout=1); break
            except OSError:
                if time.monotonic() > dl: raise
                time.sleep(.3)
        s.sock.settimeout(90); s.buf = b''; s.mid = 0; s.read()
    def read(s):
        while b':' not in s.buf:
            b = s.sock.recv(65536)
            if not b: raise EOFError
            s.buf += b
        n, r = s.buf.split(b':', 1); n = int(n)
        while len(r) < n:
            b = s.sock.recv(65536)
            if not b: raise EOFError
            r += b
        s.buf = r[n:]; return json.loads(r[:n])
    def cmd(s, name, params=None):
        s.mid += 1; raw = json.dumps([0, s.mid, name, params or {}]).encode(); s.sock.sendall(str(len(raw)).encode() + b':' + raw)
        while True:
            m = s.read()
            if m[1] == s.mid:
                if m[2]: raise RuntimeError(f'{name}: {m[2]}')
                return m[3]
    def ctx(s, c): s.cmd('Marionette:SetContext', {'value': c})
    def js(s, script, ctx='content', args=None):
        s.ctx(ctx); return s.cmd('WebDriver:ExecuteScript', {'script': script, 'args': args or [], 'scriptTimeout': 60000})['value']
    def url(s):
        s.ctx('content'); return s.cmd('WebDriver:GetCurrentURL')['value']
    def nav(s, url):
        s.ctx('content'); s.cmd('WebDriver:Navigate', {'url': url}); time.sleep(0.8)
    def wait_url(s, pred, t=20):
        dl = time.monotonic() + t
        while time.monotonic() < dl:
            try:
                u = s.url(); rs = s.js('return document.readyState')
                if pred(u) and rs == 'complete': time.sleep(0.8); return u
            except Exception: pass
            time.sleep(0.3)
        return None
    def trigger(s, code, pred, t=30):
        """NEW RULE (r2): never poll a window we just told to navigate. Inject the nav-causing script (no __qa polling),
        then wait from the CHROME context (gBrowser.selectedBrowser URI + webProgress) until the new document finished loading."""
        inj = "const s=document.createElement('script');s.textContent='setTimeout(()=>{'+arguments[0]+'},60);';document.documentElement.appendChild(s);s.remove();return true;"
        s.js(inj, 'content', [X(code)])
        dl = time.monotonic() + t; time.sleep(0.4); stable = 0
        while time.monotonic() < dl:
            L = s.js("return gBrowser.browsers.map(b=>[b.currentURI.spec, b.webProgress.isLoadingDocument]);", 'chrome')
            st = next((x for x in L if pred(x[0])), [None, True])
            if st[0] and not st[1]:
                stable += 1
                if stable >= 3: time.sleep(0.6); return st[0]
            else: stable = 0
            time.sleep(0.25)
        return None
    CENSUS = r'''let FW=null;try{FW=ChromeUtils.importESModule("moz-src:///browser/components/DarkstrCookieFirewall.sys.mjs").DarkstrCookieFirewall}catch(e){return {err:"no-module: "+e}}
const live=new Set();for(const a of (FW._liveActors||[])){try{live.add(a.manager.innerWindowId)}catch(e){}}
const out=[];const walk=(bc,depth)=>{const w=bc.currentWindowGlobal;out.push({depth,url:w&&w.documentURI?w.documentURI.spec:null,id:w?w.innerWindowId:0,sandboxed:!!(w&&live.has(w.innerWindowId))});for(const c of bc.children)walk(c,depth+1);};
walk(gBrowser.selectedBrowser.browsingContext,0);return out;'''
    def census(s):
        """Which documents of the selected tab the cookie firewall sandboxed (parent _liveActors), per frame.
        0048 alone hooks with an own document.cookie accessor (hk() == 'get cookie'); from 0051 on the hook replaces the
        Document.prototype accessor with a native-shaped one, so only this privileged census can tell hooked from native."""
        try: return s.js(s.CENSUS, 'chrome')
        except Exception as e: return {'err': repr(e)}
    def page(s, code, tag, t=60):
        """Run code as *page* script (inserted <script>), so it sees the page's own document.cookie hook, not the Xray/native one."""
        inj = r'''const code=arguments[0],tag=arguments[1];const s=document.createElement('script');
s.textContent="(async()=>{window.__qa=window.__qa||{};let r;try{r=await (async()=>{"+code+"\n})();}catch(e){r={exception:String(e),stack:String(e&&e.stack)}};window.__qa["+JSON.stringify(tag)+"]=JSON.stringify(r===undefined?null:r);})();";
document.documentElement.appendChild(s);s.remove();return true;'''
        s.js(inj, 'content', [X(code), tag])
        dl = time.monotonic() + t
        while time.monotonic() < dl:
            v = s.js('const w=window.wrappedJSObject||window;return (w.__qa&&typeof w.__qa[arguments[0]]==="string")?w.__qa[arguments[0]]:null;', 'content', [tag])
            if v is not None:
                r = json.loads(v)
                if isinstance(r, dict) and os.environ.get('XOR_CENSUS', '1') != '0': r['__census'] = s.census()
                return r
            time.sleep(0.3)
        return {'harnessTimeout': True}

base = {'remote.prefs.recommended': False, 'browser.startup.homepage': 'about:blank', 'browser.startup.page': 0, 'browser.shell.checkDefaultBrowser': False,
        'network.proxy.type': 1, 'network.proxy.http': '127.0.0.1', 'network.proxy.http_port': 9, 'network.proxy.ssl': '127.0.0.1', 'network.proxy.ssl_port': 9,
        'network.proxy.no_proxies_on': 'localhost,127.0.0.1,[::1],::1' + (',' + LAN if LAN else ''), 'network.proxy.allow_hijacking_localhost': False,
        'dom.security.https_only_mode': False, 'devtools.jsonview.enabled': False, 'dom.disable_open_during_load': False}
SPEC = {'darkstr.mode': 'pollution', 'darkstr.nativePersonaHooks': True, 'darkstr.cookieFirewall.enabled': True}
HIST = {'darkstr.nativeCompatible': False, 'darkstr.strictFirstDoc': True, 'darkstr.persona.rotatePerSite': True,
        'privacy.resistFingerprinting': False, 'privacy.fingerprintingProtection': False, 'dom.webgpu.enabled': True}
ARM = {**SPEC, **HIST}
CFGS = {
    'default': {},
    'A_iso': {**ARM, 'darkstr.cookieFirewall.mode': 'isolate'},
    'A_syn': {**ARM, 'darkstr.cookieFirewall.mode': 'synthetic'},
    'A_iso42': {**ARM, 'darkstr.cookieFirewall.mode': 'isolate', 'darkstr.persona.seed': 42},
    'A_syn42': {**ARM, 'darkstr.cookieFirewall.mode': 'synthetic', 'darkstr.persona.seed': 42},
    'S_iso': {**SPEC, 'darkstr.cookieFirewall.mode': 'isolate'},
    'S_syn': {**SPEC},  # synthetic via unset mode
    'S_iso42': {**SPEC, 'darkstr.cookieFirewall.mode': 'isolate', 'darkstr.persona.seed': 42},
    'S_syn42': {**SPEC, 'darkstr.cookieFirewall.mode': 'synthetic', 'darkstr.persona.seed': 42},
    'A_syn42b': {**ARM, 'darkstr.cookieFirewall.mode': 'synthetic', 'darkstr.persona.seed': 42},
    'A_iso_allow': {**ARM, 'darkstr.cookieFirewall.mode': 'isolate', 'darkstr.cookieFirewall.allowlist': 'localhost'},
}
prefs = {**base, **CFGS[CFG]}
if LAN and not LAN.replace('.', '').isdigit():
    # r2: insecure non-loopback-named origin that still resolves to 127.0.0.1 (sandbox-safe stand-in for the LAN IP of the r1 F1 repro)
    prefs['network.dns.localDomains'] = LAN
prof = Path(tempfile.mkdtemp(prefix='xor48-prof-')); mport = free_port(); prefs['marionette.port'] = mport
(prof / 'user.js').write_text(''.join('user_pref(' + json.dumps(k) + ',' + json.dumps(v) + ');\n' for k, v in prefs.items()))
out = {'config': CFG, 'userjs': prefs, 'profile': str(prof), 'serverPort': P, 'lan': LAN, 'lanReal': LAN_REAL, 'f1LanOnly': os.environ.get('XOR_F1_LAN_ONLY') == '1', 'origins': {'A': A, 'B': B, 'C': C, 'D': D}, 'cases': {}, 'jar': {}, 'started': time.strftime('%Y-%m-%d %H:%M:%S %Z')}
log = (OUT / f'{OUTNAME}.browser.log').open('w')
CMD = [BIN, '-headless', '-no-remote', '--marionette', '-remote-allow-system-access', '-profile', str(prof)]; PENV = dict(os.environ)
if os.environ.get('XOR_SB'):  # OS-level loopback-only (Seatbelt); nested sandboxing needs Gecko's own sandboxes off
    CMD = ['sandbox-exec', '-f', os.environ['XOR_SB']] + CMD
    PENV.update({k: '1' for k in ('MOZ_DISABLE_CONTENT_SANDBOX', 'MOZ_DISABLE_GMP_SANDBOX', 'MOZ_DISABLE_RDD_SANDBOX', 'MOZ_DISABLE_UTILITY_SANDBOX', 'MOZ_DISABLE_SOCKET_PROCESS_SANDBOX', 'MOZ_DISABLE_GPU_SANDBOX')})
    out['sandbox'] = open(os.environ['XOR_SB']).read()
proc = subprocess.Popen(CMD, stdout=log, stderr=subprocess.STDOUT, env=PENV)
out['browserPid'] = proc.pid
DIAGK = ['darkstr.mode', 'darkstr.nativePersonaHooks', 'darkstr.nativeCompatible', 'darkstr.strictFirstDoc', 'darkstr.persona.rotatePerSite', 'darkstr.persona.seed',
         'darkstr.cookieFirewall.enabled', 'darkstr.cookieFirewall.mode', 'darkstr.cookieFirewall.allowlist', 'darkstr.cookieFirewall.armed',
         'darkstr.cookieFirewall.lastInstall', 'darkstr.cookieFirewall.lastError', 'darkstr.cookieFirewall.lastDecision', 'darkstr.cookieFirewall.lastPartition',
         'darkstr.cookieFirewall.lastCookieOut', 'darkstr.cookieFirewall.lastCookieSet', 'darkstr.cookieFirewall.lastCookieErr', 'darkstr.cookieFirewall.lastEtld',
         'darkstr.cookieFirewall.lastHttpEtld', 'darkstr.cookieFirewall.lastSeed', 'darkstr.persona.ua', 'general.useragent.override',
         'privacy.resistFingerprinting', 'privacy.fingerprintingProtection', 'network.cookie.cookieBehavior', 'network.cookie.cookieBehavior.optInPartitioning',
         'network.cookie.sameSite.laxByDefault', 'network.cookie.sameSite.noneRequiresSecure', 'dom.webgpu.enabled']
DIAG = 'const n=' + json.dumps(DIAGK) + ''';const o={};for(const k of n){const t=Services.prefs.getPrefType(k);let v=null;try{v=t===32?Services.prefs.getStringPref(k):t===64?Services.prefs.getIntPref(k):t===128?Services.prefs.getBoolPref(k):null;}catch(e){v='err:'+e}o[k]={v,user:Services.prefs.prefHasUserValue(k)};}return o;'''
JAR = "return Services.cookies.cookies.map(c=>({host:c.host,name:c.name,value:c.value,httpOnly:c.isHttpOnly,pk:c.originAttributes.partitionKey||''}));"
LSOF = []
def lsof_peer_class(line): return _net.lsof_peer_class(line, LAN if LAN_REAL else '', SELF_HOSTS)
def _lsof_loop():
    while proc.poll() is None:
        try:
            pids = [str(proc.pid)] + subprocess.run(['pgrep', '-P', str(proc.pid)], capture_output=True, text=True).stdout.split()
            r = subprocess.run(['lsof', '-a', '-p', ','.join(pids), '-i', '-n', '-P'], capture_output=True, text=True).stdout
            ext, selfLan = [], 0
            for l in r.splitlines()[1:]:
                k = lsof_peer_class(l)
                if k == 'external': ext.append(l)
                elif k == 'lan-self': selfLan += 1
            LSOF.append({'t': time.strftime('%H:%M:%S'), 'nonLoopback': ext, 'lanSelf': selfLan})
        except Exception as e: LSOF.append({'err': repr(e)})
        time.sleep(3)
threading.Thread(target=_lsof_loop, daemon=True).start()
m = None
def jar(label):
    try: out['jar'][label] = m.js(JAR, 'chrome')
    except Exception as e: out['jar'][label] = {'err': repr(e)}
def case(name, code, tag=None):
    try: out['cases'][name] = m.page(code, tag or name)
    except Exception as e: out['cases'][name] = {'harnessError': repr(e)}
    return out['cases'][name]
SNAP = "return {url:location.href,hook:hk(),ua:navigator.userAgent,docCookie:document.cookie};"
try:
    m = M(mport); m.cmd('WebDriver:NewSession', {'capabilities': {'pageLoadStrategy': 'normal'}}); time.sleep(1)
    try: out['startDiag'] = m.js(DIAG, 'chrome')
    except Exception as e: out['startDiag'] = {'err': repr(e)}
    jar('start')
    if os.environ.get('XOR_PROBE'):
        m.nav(A + '/?p1'); m.nav(A + '/?p2')
        out['probe'] = m.page(open(os.environ['XOR_PROBE']).read(), 'probe', t=60); jar('afterProbe')
        raise SystemExit(0)
    if os.environ.get('XOR_F1'):
        # r2 F1 retest: heavy, multi-cookie-per-response; extra same-partition actors (2 same-origin iframes + 1 noopener-free popup) and a cross-site iframe
        ND = int(os.environ['XOR_F1']); FPD = int(os.environ.get('XOR_F1_FPD', '10')); origins = [D, B, C, A] if D else [B, C, A]; res = []
        if os.environ.get('XOR_F1_LAN_ONLY') == '1':
            if not LAN_REAL: raise RuntimeError('XOR_F1_LAN_ONLY=1 needs XOR_LAN=<own IPv4>|auto')
            origins = [D]
        if LAN_REAL:  # the real LAN origin must load inside this browser (and sandbox) before the stress counts
            m.nav(D + '/?f1lanpre'); out['f1LanPreflight'] = {'url': m.url(), 'srv': [x.get('host') for x in SRV_LOG if x.get('query', '').startswith('f1lanpre')]}
            if not out['f1LanPreflight']['srv']: raise RuntimeError('LAN origin %s not reachable from the browser' % D)
        F1JS = r"""
const it=ITER, fpd=FPD, out={o:location.origin,hook:hk(),iters:[],conc:[]};
const so1=await addFrame('/frame?t=f1so1'), so2=await addFrame('/frame?t=f1so2'); await addFrame('XS/frame?t=f1xs');
let pw=null; try{ pw=window.open('/?f1pop','f1pop'+it); await nap(600);}catch(e){}
let prev=null;
for(let j=0;j<fpd;j++){
  const p='f'+it+'_'+j; const vis=[p+'a',p+'l',p+'s',p+'m'], hid=[p+'h',p+'p'];
  const q='&c='+enc(p+'a=1; Path=/')+'&c='+enc(p+'l=2; SameSite=Lax; Path=/')+'&c='+enc(p+'s=3; SameSite=Strict; Path=/')+'&c='+enc(p+'m=4; Max-Age=600; Path=/')+'&c='+enc(p+'h=5; HttpOnly; Path=/')+'&c='+enc(p+'p=6; Path=/sub')+(prev?['a','l','s','m','h'].map(x=>'&c='+enc(prev+x+'=; Max-Age=0; Path=/')).join('')+'&c='+enc(prev+'p=; Max-Age=0; Path=/sub'):'');
  const t0=performance.now(); await fetch('/set?t=f1'+q); const dur=performance.now()-t0;
  const has=(c,n)=>c.split('; ').some(x=>x.startsWith(n+'='));
  const top=document.cookie, c1=so1.contentDocument.cookie, c2=so2.contentDocument.cookie; let cp=null; try{cp=pw&&!pw.closed?pw.document.cookie:null}catch(e){cp='err'}
  out.iters.push({p,dur:Math.round(dur),missTop:vis.filter(n=>!has(top,n)),missSo1:vis.filter(n=>!has(c1,n)),missSo2:vis.filter(n=>!has(c2,n)),missPop:cp==null?null:vis.filter(n=>!has(cp,n)),leak:hid.filter(n=>has(top,n)||has(c1,n)),staleDel:prev?['a','l','s','m'].map(x=>prev+x).filter(n=>has(top,n)||has(c1,n)):[]});
  prev=p;
}
if(prev) await fetch('/set?t=f1d'+['a','l','s','m','h'].map(x=>'&c='+enc(prev+x+'=; Max-Age=0; Path=/')).join('')+'&c='+enc(prev+'p=; Max-Age=0; Path=/sub'));
{ const p='fc'+it; const t0=performance.now();
  await Promise.all([0,1,2].map(k=>fetch('/set?t=f1c&c='+enc(p+'x'+k+'=1; Path=/')+'&c='+enc(p+'y'+k+'=2; SameSite=Lax; Path=/'))));
  const dur=performance.now()-t0; const top=document.cookie, c1=so1.contentDocument.cookie; const want=[0,1,2].flatMap(k=>[p+'x'+k,p+'y'+k]);
  const has=(c,n)=>c.split('; ').some(x=>x.startsWith(n+'='));
  out.conc.push({p,dur:Math.round(dur),missTop:want.filter(n=>!has(top,n)),missSo1:want.filter(n=>!has(c1,n))});
  await fetch('/set?t=f1cd'+want.map(n=>'&c='+enc(n+'=; Max-Age=0; Path=/')).join('')); }
try{pw&&pw.close()}catch(e){}
out.endDoc=document.cookie.split('; ').filter(x=>x.startsWith('f')).length; out.httpEnd=(await echo('/echo?t=f1h')).cookie;
return out;"""
        t0 = time.time()
        for i in range(ND):
            o = origins[i % len(origins)]; xs = B if o != B else A
            r0 = None
            m.nav(o + f'/?f1doc{i}')
            r = m.page(F1JS.replace('ITER', str(i)).replace('FPD', str(FPD)).replace('XS', xs), f'f1_{i}', t=120)
            r['doc'] = i; res.append(r)
            # close any leftover popup tabs from chrome (only our own browser)
            try: m.js("for(const t of [...gBrowser.tabs].slice(1)) gBrowser.removeTab(t); return 1;", 'chrome')
            except Exception: pass
        out['f1'] = res; out['f1Secs'] = round(time.time() - t0, 1); jar('afterF1')
        raise SystemExit(0)
    if os.environ.get('XOR_STRESS'):
        # staleness stress: fetch() Set-Cookie must be in document.cookie when the fetch promise resolves (spec check 7)
        N = int(os.environ['XOR_STRESS']); origins = [D, B, C, A] if D else [B, C, A]; res = []
        for i in range(N):
            o = origins[i % len(origins)]
            m.nav(o + f'/?stz{i}')
            r = m.page(f"await fetch('/set?t=stz{i}&c='+enc('sz{i}=V{i}; Path=/')); const imm=document.cookie.includes('sz{i}='); await nap(30); const l30=document.cookie.includes('sz{i}='); await nap(500); const l500=document.cookie.includes('sz{i}='); const h=(await echo('/echo?t=stzh{i}')).cookie.includes('sz{i}='); return {{o:location.origin,firstVisit:{'true' if i < len(origins) else 'false'},imm,l30,l500,http:h,hook:hk()}}", f'stz{i}')
            r2 = m.page(f"await fetch('/set?t=sty{i}&c='+enc('sy{i}=W{i}; Path=/')); return {{imm:document.cookie.includes('sy{i}=')}}", f'sty{i}')
            r['sameDocSecondFetchImm'] = r2.get('imm'); res.append(r)
        out['stress'] = res; jar('afterStress')
        raise SystemExit(0)
    # ---- N1 (spec check 5) + first document + functional re-hook ----
    n1 = {}
    def n1step(k, write=True):
        code = "const r={url:location.href,hook:hk(),ua:navigator.userAgent};" + (f"document.cookie='qa_{k}=ORIG_{k}; path=/';" if write else "") + \
               f"r.docCookie=document.cookie;r.http=(await echo('/echo?t=n1-{k}')).cookie;return r;"
        n1[k] = m.page(code, 'n1' + k); n1[k]['srvNav'] = [x['cookie'] for x in SRV_LOG if x['query'].startswith(k)]
        jar('n1-' + k)
    m.nav(A + '/?n0'); n1step('n0')
    m.nav(A + '/?n1'); n1step('n1')
    m.nav(A + '/?n2'); n1step('n2')
    m.nav(B + '/?n3'); n1step('n3')
    m.nav(A + '/?n4'); n1step('n4')
    m.ctx('content'); m.cmd('WebDriver:Refresh'); time.sleep(1); n1step('reload')
    out['navs'] = {}; out['navs']['n6'] = m.trigger("location.href='/?n6'", lambda u: 'n6' in u); n1step('n6')       # script nav
    out['navs']['n7'] = m.trigger("const a=document.createElement('a');a.href='/?n7';document.body.append(a);a.click()", lambda u: 'n7' in u); n1step('n7')  # link click
    out['navs']['back'] = m.trigger("history.back()", lambda u: 'n6' in u); n1step('back', write=False)  # history back (bfcache)
    out['navs']['reload2'] = m.trigger("location.reload()", lambda u: 'n6' in u); n1step('reload2')
    out['cases']['N1'] = n1
    # ---- check 1: B1 cross-site iframe ----
    m.nav(A + '/?b1')
    case('B1', r'''
document.cookie='qa_marker=ORIG_TOP_JS; path=/; SameSite=Lax';
await fetch('/set?t=b1set&c='+enc('qa_top_http=ORIG_TOP_HTTP; Path=/')+'&c='+enc('qa_top_ho=ORIG_TOP_HO; HttpOnly; Path=/')+'&c='+enc('qa_top_none=ORIG_NONE; SameSite=None; Secure; Path=/'));
await nap(200);
const res={topCookie:document.cookie, topHook:hk(), topHttp:(await echo('/echo?t=b1-top')).cookie};
for (const [k,origin] of [['b1v4','%B%'],['b1v6','%C%']]) {
  const f=await addFrame(origin+'/frame?t='+k+'-nav');
  res[k]=await ask(f.contentWindow, `const r={origin:location.origin,hook:hk(),cookie:document.cookie,store:await cs()}; r.http=(await echo('/echo?t=${k}-echo')).cookie; document.cookie='qa_child3p=CHILD_${k}; path=/'; r.cookieAfterWrite=document.cookie; try{await fetch('%A%/echo?t=${k}-aba',{mode:'no-cors',credentials:'include'})}catch(e){}
   const nf=await addFrame('%A%/frame?t=${k}-nest'); r.nested=await ask(nf.contentWindow,"return {origin:location.origin,hook:hk(),cookie:document.cookie,store:await cs(),http:(await echo('/echo?t=${k}-nestecho')).cookie}"); return r;`);
}
await nap(300);
res.topAfter=document.cookie; res.topHttpAfter=(await echo('/echo?t=b1-topafter')).cookie;
return res;''')
    out['cases']['B1']['srv'] = {k: srvlog(k) for k in ['b1v4-nav', 'b1v4-echo', 'b1v4-aba', 'b1v4-nest', 'b1v4-nestecho', 'b1v6-nav', 'b1v6-echo', 'b1v6-aba', 'b1v6-nest', 'b1v6-nestecho', 'b1-top', 'b1-topafter']}
    jar('B1')
    # ---- check 2: B2 HttpOnly + attributes ----
    case('B2', r'''
const r={};
await fetch('/set?t=b2set&c='+enc('qa_http_only=ORIG_HO; HttpOnly; Path=/; SameSite=Lax'));
r.topCookie=document.cookie; r.storeGet=await cs('qa_http_only'); r.storeAll=await cs();
const f=await addFrame('/frame?t=b2-nav');
r.childCookie=f.contentDocument.cookie; r.childHook=hk(f.contentDocument);
r.childAsk=await ask(f.contentWindow,"return {cookie:document.cookie, store: await cs(), hook:hk()}");
r.http1=(await echo('/echo?t=b2-e1')).cookie;
document.cookie='qa_http_only=SCRIPT_OVERWRITE; path=/'; r.afterOverwriteDoc=document.cookie;
await nap(300); r.http2=(await echo('/echo?t=b2-e2')).cookie;
document.cookie='qa_js_ho=JS_HO; path=/; HttpOnly'; r.afterJsHo=document.cookie; r.http3=(await echo('/echo?t=b2-e3')).cookie;
try{ if(window.cookieStore) await cookieStore.set('qa_http_only','CS_OVERWRITE'); r.csSet='ok' }catch(e){ r.csSet='err:'+e }
await nap(300); r.http4=(await echo('/echo?t=b2-e4')).cookie; r.afterCs=document.cookie;
await fetch('/set?t=b2attr&c='+enc('qa_path=ORIG_PATH; Path=/sub')+'&c='+enc('qa_maxage=ORIG_MA; Max-Age=3; Path=/')+'&c='+enc('qa_past=ORIG_PAST; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/')+'&c='+enc('qa_del=ORIG_DEL; Path=/')+'&c='+enc('qa_foreign=ORIG_FOREIGN; Domain=example.com; Path=/')+'&c='+enc('qa_future=ORIG_FUT; Expires=Fri, 01 Jan 2038 00:00:00 GMT; Path=/')+'&c='+enc('qa_sec_local=ORIG_SL; Secure; Path=/')+'&c='+enc('__Host-qa_l=ORIG_HL; Secure; Path=/')+'&c='+enc('__Host-qa_bad=ORIG_HB; Secure; Path=/sub'));
r.attrDoc=document.cookie; r.attrHttpRoot=(await echo('/echo?t=b2-root')).cookie; r.attrHttpSub=(await echo('/sub/echo?t=b2-sub')).cookie;
const fs=await addFrame('/sub/frame?t=b2-subnav'); r.subFrameCookie=fs.contentDocument.cookie;
await fetch('/set?t=b2del&c='+enc('qa_del=; Max-Age=0; Path=/')); r.afterDelDoc=document.cookie; r.afterDelHttp=(await echo('/echo?t=b2-afterdel')).cookie;
await nap(3300); r.afterExpiryDoc=document.cookie; r.afterExpiryHttp=(await echo('/echo?t=b2-afterexp')).cookie;
document.cookie='qa_js_path=JSP; path=/sub'; document.cookie='qa_js_ma=JSMA; max-age=2; path=/'; document.cookie='qa_js_past=JSPAST; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
r.jsAttrDoc=document.cookie; r.jsAttrSubHttp=(await echo('/sub/echo?t=b2-jssub')).cookie; r.jsAttrRootHttp=(await echo('/echo?t=b2-jsroot')).cookie;
await nap(2300); r.jsAfterExpDoc=document.cookie; r.jsAfterExpHttp=(await echo('/echo?t=b2-jsafterexp')).cookie;
await fetch('/set?t=b2ss&c='+enc('qa_ss_strict=ORIG_STRICT; SameSite=Strict; Path=/')+'&c='+enc('qa_ss_lax=ORIG_LAX; SameSite=Lax; Path=/')+'&c='+enc('qa_ss_none=ORIG_SSNONE; SameSite=None; Secure; Path=/')+'&c='+enc('qa_ss_unset=ORIG_UNSET; Path=/'));
r.ssDoc=document.cookie; r.ssHttp=(await echo('/echo?t=b2-ss')).cookie;
return r;''')
    jar('B2')
    # ---- check 3: credentials omit ----
    case('OMIT', r'''
const r={}; document.cookie='qa_omit=ORIG_OMIT; path=/';
r.omit=(await echo('/echo?t=om-omit',{credentials:'omit'})).cookie;
r.normal=(await echo('/echo?t=om-normal')).cookie;
r.sameorigin=(await echo('/echo?t=om-so',{credentials:'same-origin'})).cookie;
await fetch('/set?t=om-set&c='+enc('qa_omit_set=ORIG_OMITSET; Path=/'),{credentials:'omit'});
await nap(300); r.afterOmitSetDoc=document.cookie; r.afterOmitSetHttp=(await echo('/echo?t=om-after')).cookie;
try{await fetch('%B%/set?t=om-3pset&c='+enc('qa_om3p=ORIG_OM3P; Path=/'),{mode:'no-cors',credentials:'include'})}catch(e){}
await nap(300);
for (const [k,o] of [['om-x-omit',{mode:'no-cors',credentials:'omit'}],['om-x-so',{mode:'no-cors',credentials:'same-origin'}],['om-x-inc',{mode:'no-cors',credentials:'include'}]]) { try{await fetch('%B%/echo?t='+k,o)}catch(e){} }
await new Promise(res=>{const x=new XMLHttpRequest(); x.open('GET','%B%/echo?t=om-x-xhr'); x.onloadend=res; x.send();});
await new Promise(res=>{const i=new Image(); i.crossOrigin='anonymous'; i.onload=i.onerror=res; i.src='%B%/echo?t=om-x-img';});
return r;''')
    out['cases']['OMIT']['srv'] = {k: srvlog(k) for k in ['om-omit', 'om-normal', 'om-so', 'om-set', 'om-after', 'om-x-omit', 'om-x-so', 'om-x-inc', 'om-x-xhr', 'om-x-img']}
    jar('OMIT')
    # ---- check 4: 3P partitioning ----
    tp = {}
    m.nav(A + '/?tpA')
    tp['A1'] = m.page(r'''
try{await fetch('%B%/set?t=tp-set&c='+enc('qa_3p=TP_A; Path=/'),{mode:'no-cors',credentials:'include'})}catch(e){}
try{await fetch('%B%/set?t=tp-setp&c='+enc('qa_3pp=TPP_A; Partitioned; Secure; SameSite=None; Path=/')+'&c='+enc('qa_3pp_nosec=TPPN_A; Partitioned; SameSite=None; Path=/'),{mode:'no-cors',credentials:'include'})}catch(e){}
await nap(300);
const f=await addFrame('%B%/frame?t=tp-a-nav');
const child=await ask(f.contentWindow,"document.cookie='qa_3p_doc=TPDOC_A; path=/'; document.cookie='qa_3pp_doc=TPPDOC_A; Partitioned; Secure; SameSite=None; path=/'; try{await cookieStore.set({name:'qa_3pp_cs',value:'TPPCS',partitioned:true,sameSite:'none'})}catch(e){} return {hook:hk(),cookie:document.cookie, http:(await echo('/echo?t=tp-a-childecho')).cookie, store:await cs()}");
try{await fetch('%B%/echo?t=tp-a-read1',{mode:'no-cors',credentials:'include'})}catch(e){}
return {child, topCookie:document.cookie};''', 'tpA1')
    m.nav(C + '/?tpC')
    tp['C'] = m.page(r'''
try{await fetch('%B%/echo?t=tp-c-read',{mode:'no-cors',credentials:'include'})}catch(e){}
const f=await addFrame('%B%/frame?t=tp-c-nav');
const child=await ask(f.contentWindow,"return {hook:hk(),cookie:document.cookie, http:(await echo('/echo?t=tp-c-childecho')).cookie, store:await cs()}");
return {child, topCookie:document.cookie};''', 'tpC')
    m.nav(B + '/?tpB1p')
    tp['B1p'] = m.page("return {hook:hk(),doc:document.cookie, http:(await echo('/echo?t=tp-b-1p')).cookie, store:await cs()}", 'tpB1p')
    m.nav(A + '/?tpA2')
    tp['A2'] = m.page(r'''
try{await fetch('%B%/echo?t=tp-a-read2',{mode:'no-cors',credentials:'include'})}catch(e){}
const f=await addFrame('%B%/frame?t=tp-a2-nav');
const child=await ask(f.contentWindow,"return {cookie:document.cookie, http:(await echo('/echo?t=tp-a2-childecho')).cookie}");
return {child};''', 'tpA2')
    tp['srv'] = {k: srvlog(k) for k in ['tp-set', 'tp-setp', 'tp-a-nav', 'tp-a-childecho', 'tp-a-read1', 'tp-c-read', 'tp-c-nav', 'tp-c-childecho', 'tp-b-1p', 'tp-a-read2', 'tp-a2-nav', 'tp-a2-childecho']}
    out['cases']['TP'] = tp; jar('TP')
    # ---- check 6: same-origin / about:blank / srcdoc iframes ----
    case('SOFRAME', r'''
const r={};
const f=await addFrame('/frame?t=so-nav');
r.soHook=hk(f.contentDocument);
f.contentDocument.cookie='qa_so_child=SO_CHILD; path=/'; r.topSyncAfterSo=document.cookie;
r.soHttp=(await echo('/echo?t=so-e')).cookie;
const b=await addFrame(null);
r.blankUrl=b.contentDocument.URL; r.blankHook=hk(b.contentDocument);
b.contentDocument.cookie='qa_blank=BLANK; path=/'; r.topSyncAfterBlank=document.cookie; r.blankRead=b.contentDocument.cookie;
r.blankHttp=(await echo('/echo?t=so-blank')).cookie;
const s=await addFrame(null,{srcdoc:'<p>srcdoc</p>'}); r.srcdocUrl=s.contentDocument.URL; r.srcdocHook=hk(s.contentDocument);
s.contentDocument.cookie='qa_srcdoc=SRCDOC; path=/'; r.topSyncAfterSrcdoc=document.cookie; r.srcdocHttp=(await echo('/echo?t=so-srcdoc')).cookie;
r.soAsk=await ask(f.contentWindow,"document.cookie='qa_so_child2=SO2; path=/'; return {hook:hk(), cookie:document.cookie}");
r.topAfterSoAsk=document.cookie;
await new Promise(res=>{f.onload=()=>setTimeout(res,400); f.src='/frame?t=so-nav2';});
r.soNav2Hook=hk(f.contentDocument); r.soNav2Cookie=f.contentDocument.cookie;
return r;''')
    jar('SOFRAME')
    # ---- check 7: staleness ----
    case('STALE', r'''
const r={};
await fetch('/set?t=st-set&c='+enc('qa_plain=ORIG_PLAIN; Path=/; SameSite=Lax')); r.immediate=document.cookie;
const f=await addFrame('/frame?t=st-ifr&c='+enc('qa_ifr_set=ORIG_IFR; Path=/')); r.afterIframeSet=document.cookie;
const e=await echo('/redir-set?t=st-redir&c='+enc('qa_redir=ORIG_REDIR; Path=/')+'&to='+enc('/echo?t=st-redir-target')); r.redirTargetHttp=e.cookie; r.afterRedirDoc=document.cookie;
const x=new XMLHttpRequest(); x.open('GET','/set?t=st-xhr&c='+enc('qa_xhr=ORIG_XHR; Path=/'),false); x.send(); r.afterSyncXhr=document.cookie;
await nap(500); r.afterSyncXhrLater=document.cookie;
const w=window.open('/?tab2&t=st-tab2&c='+enc('qa_tab2=ORIG_TAB2; Path=/'),'_blank','noopener'); r.popupReturned=String(w);
await nap(3000); r.afterNoopenerTab=document.cookie;
r.finalHttp=(await echo('/echo?t=st-final')).cookie;
return r;''')
    jar('STALE')
    # ---- SameSite cross-site navigation (B2 attribute semantics, server-side) ----
    m.nav(B + '/?ssx')
    out['navs']['ssgo'] = m.trigger("location.href='%A%/navecho?t=ss-nav'", lambda u: 'ss-nav' in u)
    out['cases']['SS_NAV'] = m.page("return {url:location.href,hook:hk(),doc:document.cookie}", 'ssnavdoc')
    m.nav(B + '/?ssx2')
    out['navs']['sspgo'] = m.trigger("const f=document.createElement('form');f.method='POST';f.action='%A%/navecho?t=ss-post';document.body.append(f);f.submit();", lambda u: 'ss-post' in u)
    m.nav(B + '/?ssx3')
    m.page("const f=await addFrame('%A%/frame?t=ss-ifr');return 1", 'ssifr')
    out['cases']['SS_NAV']['srv'] = {k: srvlog(k) for k in ['ss-nav', 'ss-post', 'ss-ifr']}
    jar('SS')
    # ---- Secure / prefixes on an insecure (non-loopback) origin ----
    if D:
        m.nav(D + '/?sec')
        case('SEC', r'''
await fetch('/set?t=secset&c='+enc('qa_sec=ORIG_SEC; Secure; Path=/')+'&c='+enc('__Secure-qa=ORIG_SP; Secure; Path=/')+'&c='+enc('__Host-qa=ORIG_HP; Path=/')+'&c='+enc('qa_insec=ORIG_INSEC; Path=/')+'&c='+enc('qa_ssnone_insec=ORIG_NI; SameSite=None; Path=/'));
document.cookie='qa_sec_js=JS_SEC; Secure; path=/'; document.cookie='qa_insec_js=JS_INSEC; path=/'; document.cookie='__Host-js=JSH; path=/';
return {hook:hk(), secureContext:isSecureContext, doc:document.cookie, http:(await echo('/echo?t=sec-e')).cookie};''')
        jar('SEC')
    # ---- probe: HTTP Set-Cookie -> document.cookie mirror per host type (LAN insecure vs 127.0.0.1 loopback) ----
    LP = r'''
const r={};
await fetch('/set?t=PFX-set&c='+enc('PFX_unset=U; Path=/')+'&c='+enc('PFX_lax=L; SameSite=Lax; Path=/')+'&c='+enc('PFX_strict=S; SameSite=Strict; Path=/')+'&c='+enc('PFX_none=N; SameSite=None; Path=/'));
r.immediate=document.cookie; await nap(1500); r.later=document.cookie; r.http=(await echo('/echo?t=PFX-e')).cookie; r.store=await cs(); r.hook=hk();
return r;'''
    for pfx, origin in [('lp', D), ('lq', B)]:
        if not origin: continue
        m.nav(origin + '/?' + pfx + '1')
        out['cases']['HTTP2DOC_' + pfx] = m.page(LP.replace('PFX', pfx), pfx + 'probe')
        m.nav(origin + '/?' + pfx + '2')
        out['cases']['HTTP2DOC_' + pfx]['afterNewDoc'] = m.page("return {doc:document.cookie,hook:hk(),http:(await echo('/echo?t=" + pfx + "-e2')).cookie}", pfx + 'probe2')
    jar('HTTP2DOC')
    # ---- check 8: real jar (taken before the adversarial probe) ----
    jar('check8')
    try: out['endDiag'] = m.js(DIAG, 'chrome')
    except Exception as e: out['endDiag'] = {'err': repr(e)}
    # ---- adversarial: native prototype paths (run last; may write the real jar) ----
    m.nav(A + '/?bypass')
    case('BYPASS', r'''
const r={};
const P=Object.getOwnPropertyDescriptor(Document.prototype,'cookie'); r.protoHas=!!P;
r.hookedReadBefore=document.cookie;
r.nativeReadBefore=P?P.get.call(document):null;
if(P) P.set.call(document,'qa_native=NATIVE_BYPASS; path=/');
r.nativeReadAfter=P?P.get.call(document):null;
r.hookedReadAfter=document.cookie;
r.http=(await echo('/echo?t=bp-e')).cookie;
try{ if(window.cookieStore){ await CookieStore.prototype.set.call(cookieStore,'qa_native_cs','NATIVE_CS'); r.nativeCsAll=(await CookieStore.prototype.getAll.call(cookieStore)).map(c=>c.name+'='+c.value); } }catch(e){ r.nativeCsErr=String(e) }
const b=await addFrame(null); const P2=Object.getOwnPropertyDescriptor(b.contentWindow.Document.prototype,'cookie'); r.crossRealmNativeRead=P2?P2.get.call(document):null;
try{ P2.set.call(document,'qa_native_ifr_top=IFR_TOP; path=/'); P2.set.call(b.contentDocument,'qa_native_ifr_self=IFR_SELF; path=/'); r.ifrRealmSet='ok'; r.ifrRealmRead=P2.get.call(b.contentDocument);}catch(e){ r.ifrRealmSetErr=String(e) }
try{ await b.contentWindow.CookieStore.prototype.set.call(b.contentWindow.cookieStore,'qa_native_ifr_cs','IFR_CS'); r.ifrCs='ok'; }catch(e){ r.ifrCsErr=String(e) }
try{ const d2=b.contentDocument; d2.open(); d2.write('<p>x</p>'); d2.close(); P.set.call(d2,'qa_native_docopen=DOCOPEN; path=/'); r.docOpenSet='ok'; }catch(e){ r.docOpenErr=String(e) }
try{ const s2=await addFrame(null,{srcdoc:'<p>s</p>'}); const P3=Object.getOwnPropertyDescriptor(s2.contentWindow.Document.prototype,'cookie'); P3.set.call(s2.contentDocument,'qa_native_srcdoc=SRCDOC_N; path=/'); r.srcdocSet='ok'; }catch(e){ r.srcdocErr=String(e) }
try{ const fr=await addFrame('/frame?t=bp-frame'); const P4=Object.getOwnPropertyDescriptor(fr.contentWindow.Document.prototype,'cookie'); P4.set.call(fr.contentDocument,'qa_native_sofr=SOFR; path=/'); r.soFrameSet='ok'; }catch(e){ r.soFrameErr=String(e) }
await nap(500); r.http2=(await echo('/echo?t=bp-e2')).cookie; r.hookedReadEnd=document.cookie;
return r;''')
    jar('afterBypass')
    out['serverLog'] = SRV_LOG[:]
except Exception as e:
    import traceback; out['harnessError'] = traceback.format_exc()
finally:
    out['serverLog'] = SRV_LOG[:]
    if m:
        try: m.cmd('Marionette:Quit', {'flags': ['eForceQuit']})
        except Exception: pass
    try: proc.wait(timeout=15)
    except subprocess.TimeoutExpired: proc.kill(); proc.wait(timeout=5)
    out['browserExit'] = proc.returncode
    out['lsof'] = {'samples': len(LSOF), 'samplesWithNonLoopback': sum(1 for x in LSOF if x.get('nonLoopback')), 'samplesWithLanSelf': sum(1 for x in LSOF if x.get('lanSelf')), 'nonLoopbackLines': sorted({l for x in LSOF for l in x.get('nonLoopback', [])})[:50]}
    try:
        if (prof / 'cookies.sqlite').exists():
            r = subprocess.run(['sqlite3', '-json', str(prof / 'cookies.sqlite'), 'select host,name,value,isHttpOnly,originAttributes from moz_cookies'], capture_output=True, text=True)
            out['cookiesSqlite'] = r.stdout.strip() or '[]'
    except Exception as e: out['cookiesSqlite'] = repr(e)
    (OUT / f'{OUTNAME}.json').write_text(json.dumps(out, indent=1) + '\n')
    srv.shutdown(); log.close(); shutil.rmtree(prof, ignore_errors=True)
print(json.dumps({'config': CFG, 'navs': out.get('navs'), 'harnessError': out.get('harnessError'), 'cases': list(out['cases'])}))
