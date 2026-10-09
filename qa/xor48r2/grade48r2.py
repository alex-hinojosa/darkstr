#!/usr/bin/env python3
"""Grade xor48 raw JSON. usage: grade.py <rawdir>  -> writes <rawdir>/../GRADE.json and GRADE.txt"""
import json, re, sys
from pathlib import Path
RAW = Path(sys.argv[1]); OUTD = RAW  # r2: grade files go into the graded dir
def names(s):
    d = {}
    for part in (s or '').split(';'):
        part = part.strip()
        if not part: continue
        k, _, v = part.partition('=')
        d.setdefault(k.strip(), []).append(v)
    return d
def has(s, n): return n in names(s)
def val(s, n):
    v = names(s).get(n); return v[0] if v else None
def srvc(case, tag):
    L = case.get('srv', {}).get(tag) or []
    return [x['cookie'] for x in L]
def srv1(case, tag):
    L = srvc(case, tag); return L[0] if L else None
WEBHOSTS = None
def webjar(j, lan):
    if not isinstance(j, list): return ['ERR:' + json.dumps(j)]
    hs = {'localhost', '127.0.0.1', '::1', '[::1]', lan, '.localhost'}
    return [f"{c['host']}|{c['name']}|pk={c['pk']}" for c in j if c['host'].lstrip('.') in hs or c['host'] in hs]

def grade(d, base=None):
    cfg = d['config']; lan = d.get('lan', '')
    armed_cfg = cfg != 'default'
    syn = armed_cfg and d['userjs'].get('darkstr.cookieFirewall.mode', 'synthetic') == 'synthetic'
    allow = 'allowlist' in ''.join(d['userjs'].keys())
    C = d.get('cases', {}); R = {'config': cfg, 'checks': {}, 'indep': {}, 'notes': [], 'harnessError': d.get('harnessError')}
    def chk(group, key, ok, detail):
        R[group][key] = {'ok': bool(ok), 'detail': detail}
    N1 = C.get('N1', {}); B1 = C.get('B1', {}); B2 = C.get('B2', {}); OM = C.get('OMIT', {}); TP = C.get('TP', {})
    SO = C.get('SOFRAME', {}); ST = C.get('STALE', {}); SS = C.get('SS_NAV', {}); SEC = C.get('SEC', {}); BP = C.get('BYPASS', {})
    TOPN = {'qa_marker', 'qa_top_http', 'qa_top_ho', 'qa_top_none'}
    # ---------- 1 B1 ----------
    sub = {}
    for k in ['b1v4', 'b1v6']:
        ch = B1.get(k, {}) or {}
        seen = {'docCookie': ch.get('cookie'), 'cookieStore': ch.get('store'), 'fetchEcho(server)': srv1(B1, k + '-echo'), 'frameNav(server)': srv1(B1, k + '-nav')}
        leak = {kk: sorted(TOPN & set(names(v if isinstance(v, str) else '; '.join(v) if isinstance(v, list) else '').keys())) for kk, v in seen.items()}
        sub[k] = {'seen': seen, 'leakedTopNames': leak, 'valid': ch.get('origin') is not None and not ch.get('askTimeout')}
    top_ok = has(B1.get('topCookie'), 'qa_marker')
    b1ok = top_ok and all(s['valid'] and not any(s['leakedTopNames'].values()) for s in sub.values()) and \
        not has(B1.get('topAfter'), 'qa_child3p') and not has(B1.get('topHttpAfter'), 'qa_child3p')
    chk('checks', '1_B1', b1ok, {'topCookie': B1.get('topCookie'), 'frames': sub, 'topAfterChildWrite': B1.get('topAfter'), 'topHttpAfterChildWrite': B1.get('topHttpAfter')})
    R['notes'].append({'B1_ABA_info(cross-site child -> top-origin no-cors credentialed request, server Cookie)': {k: srv1(B1, k + '-aba') for k in ['b1v4', 'b1v6']}})
    # independent: ABA (cross-site child -> top-site request / nested top-site frame) vs stock TCP
    if base is not None:
        bB1 = base['cases'].get('B1', {})
        aba = {}
        for k in ['b1v4', 'b1v6']:
            arm = {'abaRequest(server)': srv1(B1, k + '-aba'), 'nestedFrameNav(server)': srv1(B1, k + '-nest'), 'nestedDocCookie': ((B1.get(k) or {}).get('nested') or {}).get('cookie'), 'nestedFetch(server)': srv1(B1, k + '-nestecho')}
            stk = {'abaRequest(server)': srv1(bB1, k + '-aba'), 'nestedFrameNav(server)': srv1(bB1, k + '-nest'), 'nestedDocCookie': ((bB1.get(k) or {}).get('nested') or {}).get('cookie'), 'nestedFetch(server)': srv1(bB1, k + '-nestecho')}
            aba[k] = {'armed': arm, 'stock': stk}
            for kk in arm:
                an = sorted(n for n in names(arm[kk]) if n in TOPN or n.startswith('qa_n') or n in ('qa_http_only',))
                sn = sorted(n for n in names(stk[kk]) if n in TOPN or n.startswith('qa_n') or n in ('qa_http_only',))
                aba[k][kk + ' topSiteNames armed==stock'] = (an == sn, an, sn)
        ok = all(v[0] for k in aba for kk, v in aba[k].items() if kk.endswith('armed==stock'))
        chk('indep', 'B1_ABA_matches_stock_TCP', ok, aba)
        # HTTP Set-Cookie -> document.cookie per host type, vs stock
        h2 = {}
        for pfx in ['lp', 'lq']:
            a_ = C.get('HTTP2DOC_' + pfx); b_ = base['cases'].get('HTTP2DOC_' + pfx)
            if not a_ or not b_: continue
            for fld in ['immediate', 'later']:
                h2[f'{pfx}.{fld}'] = (sorted(names(a_.get(fld))) == sorted(names(b_.get(fld))), sorted(names(a_.get(fld))), sorted(names(b_.get(fld))))
            h2[f'{pfx}.http'] = (sorted(names(a_.get('http'))) == sorted(names(b_.get('http'))), sorted(names(a_.get('http'))), sorted(names(b_.get('http'))))
            h2[f'{pfx}.afterNewDoc'] = (sorted(names((a_.get('afterNewDoc') or {}).get('doc'))) == sorted(names((b_.get('afterNewDoc') or {}).get('doc'))), sorted(names((a_.get('afterNewDoc') or {}).get('doc'))), sorted(names((b_.get('afterNewDoc') or {}).get('doc'))))
            # internal consistency: every non-HttpOnly cookie sent on HTTP is visible to script
            h2[f'{pfx}.doc==http (later)'] = (sorted(names(a_.get('later'))) == sorted(names(a_.get('http'))), sorted(names(a_.get('later'))), sorted(names(a_.get('http'))))
        if h2:
            chk('indep', 'HTTP_SetCookie_visible_to_script_per_host', all(v[0] for v in h2.values()), h2)
    # ---------- 2 B2 ----------
    v1 = val(B2.get('http1'), 'qa_http_only')
    hid = {k: B2.get(k) for k in ['topCookie', 'childCookie', 'storeGet', 'storeAll']}
    hid['childAsk.cookie'] = (B2.get('childAsk') or {}).get('cookie'); hid['childAsk.store'] = (B2.get('childAsk') or {}).get('store')
    def contains_ho(v):
        if v is None: return False
        if isinstance(v, list): v = '; '.join(v)
        return 'qa_http_only' in str(v)
    hidden_ok = not any(contains_ho(v) for v in hid.values())
    sent_ok = v1 is not None and (v1 == 'ORIG_HO' if not syn else v1 != 'ORIG_HO')
    over_ok = names(B2.get('http2')).get('qa_http_only') == [v1] and not contains_ho(B2.get('afterOverwriteDoc'))
    chk('checks', '2_B2', hidden_ok and sent_ok and over_ok, {'hiddenFromScript': hid, 'http1(server)': B2.get('http1'), 'afterOverwriteHttp': B2.get('http2'), 'afterOverwriteDoc': B2.get('afterOverwriteDoc')})
    # independent B2 attribute assertions
    a = B2
    attrs = {
        'js cannot create HttpOnly (doc)': not has(a.get('afterJsHo'), 'qa_js_ho'),
        'js cannot create HttpOnly (http)': not has(a.get('http3'), 'qa_js_ho'),
        'cookieStore cannot overwrite HttpOnly (http)': names(a.get('http4')).get('qa_http_only') == [v1],
        'Path=/sub hidden at / (doc)': not has(a.get('attrDoc'), 'qa_path'),
        'Path=/sub not sent to /echo': not has(a.get('attrHttpRoot'), 'qa_path'),
        'Path=/sub sent to /sub/echo': has(a.get('attrHttpSub'), 'qa_path'),
        'Path=/sub visible in /sub/frame doc': has(a.get('subFrameCookie'), 'qa_path'),
        'Max-Age=3 present before expiry': has(a.get('attrDoc'), 'qa_maxage') and has(a.get('attrHttpRoot'), 'qa_maxage'),
        'Max-Age=3 gone after expiry (doc)': not has(a.get('afterExpiryDoc'), 'qa_maxage'),
        'Max-Age=3 gone after expiry (http)': not has(a.get('afterExpiryHttp'), 'qa_maxage'),
        'past Expires not stored': not has(a.get('attrDoc'), 'qa_past') and not has(a.get('attrHttpRoot'), 'qa_past'),
        'future Expires kept': has(a.get('afterExpiryDoc'), 'qa_future') and has(a.get('afterExpiryHttp'), 'qa_future'),
        'Max-Age=0 deletes (doc+http)': has(a.get('attrDoc'), 'qa_del') and not has(a.get('afterDelDoc'), 'qa_del') and not has(a.get('afterDelHttp'), 'qa_del'),
        'foreign Domain=example.com rejected': not has(a.get('attrDoc'), 'qa_foreign') and not has(a.get('attrHttpRoot'), 'qa_foreign'),
        '__Host- with Path=/sub rejected': not has(a.get('attrDoc'), '__Host-qa_bad') and not has(a.get('attrHttpSub'), '__Host-qa_bad'),
        'js path=/sub hidden at / and sent to /sub': not has(a.get('jsAttrDoc'), 'qa_js_path') and has(a.get('jsAttrSubHttp'), 'qa_js_path') and not has(a.get('jsAttrRootHttp'), 'qa_js_path'),
        'js max-age=2 expires (doc+http)': has(a.get('jsAttrDoc'), 'qa_js_ma') and not has(a.get('jsAfterExpDoc'), 'qa_js_ma') and not has(a.get('jsAfterExpHttp'), 'qa_js_ma'),
        'js past expires not stored': not has(a.get('jsAttrDoc'), 'qa_js_past'),
        'SameSite cookies visible same-site (doc)': all(has(a.get('ssDoc'), n) for n in ['qa_ss_strict', 'qa_ss_lax', 'qa_ss_none', 'qa_ss_unset']),
        'SameSite cookies sent same-site (http)': all(has(a.get('ssHttp'), n) for n in ['qa_ss_strict', 'qa_ss_lax', 'qa_ss_none', 'qa_ss_unset']),
    }
    ssnav = srv1(SS, 'ss-nav'); sspost = srv1(SS, 'ss-post'); ssifr = srv1(SS, 'ss-ifr')
    attrs['SameSite=Strict NOT sent on cross-site top-level GET'] = ssnav is not None and not has(ssnav, 'qa_ss_strict')
    attrs['SameSite=Lax sent on cross-site top-level GET'] = ssnav is not None and has(ssnav, 'qa_ss_lax')
    attrs['SameSite=Strict/Lax NOT sent on cross-site POST nav'] = sspost is not None and not has(sspost, 'qa_ss_strict') and not has(sspost, 'qa_ss_lax')
    attrs['SameSite=None;Secure sent on cross-site POST nav'] = sspost is not None and has(sspost, 'qa_ss_none')
    attrs['localhost cookies not sent to localhost frame under 127.0.0.1 top'] = ssifr is not None and not any(n.startswith('qa_') for n in names(ssifr))
    if SEC:
        attrs['insecure origin: Secure/__Secure-/__Host- rejected (doc)'] = not any(has(SEC.get('doc'), n) for n in ['qa_sec', '__Secure-qa', '__Host-qa', 'qa_sec_js', '__Host-js'])
        attrs['insecure origin: Secure/__Secure-/__Host- rejected (http)'] = not any(has(SEC.get('http'), n) for n in ['qa_sec', '__Secure-qa', '__Host-qa', 'qa_sec_js', '__Host-js'])
        attrs['insecure origin: plain cookies accepted (http + script-set visible)'] = has(SEC.get('doc'), 'qa_insec_js') and has(SEC.get('http'), 'qa_insec') and has(SEC.get('http'), 'qa_insec_js')
    # stock-baseline comparisons (names only)
    if base is not None:
        bB2 = base['cases'].get('B2', {}); bSS = base['cases'].get('SS_NAV', {}); bSEC = base['cases'].get('SEC', {}); bST = base['cases'].get('STALE', {})
        def nm(s, pref): return sorted(n for n in names(s) if n.startswith(pref))
        cmp = {
            'localhost Secure/__Host- acceptance == stock': (nm(a.get('attrHttpRoot'), 'qa_sec') + nm(a.get('attrHttpRoot'), '__Host'), nm(bB2.get('attrHttpRoot'), 'qa_sec') + nm(bB2.get('attrHttpRoot'), '__Host')),
            'cross-site GET nav SameSite set == stock': (nm(ssnav, 'qa_ss'), nm(srv1(bSS, 'ss-nav'), 'qa_ss')),
            'cross-site POST nav SameSite set == stock': (nm(sspost, 'qa_ss'), nm(srv1(bSS, 'ss-post'), 'qa_ss')),
        }
        if SEC and bSEC:
            cmp['insecure-origin cookie set (http) == stock'] = (sorted(names(SEC.get('http'))), sorted(names(bSEC.get('http'))))
        for k, (x, y) in cmp.items():
            attrs[k] = x == y
            R['notes'].append({k: {'armed': x, 'stock': y}})
    chk('indep', 'B2_attributes', all(attrs.values()), {k: v for k, v in attrs.items()})
    # ---------- 3 omit ----------
    om_omit = srv1(OM, 'om-omit'); om_norm = srv1(OM, 'om-normal')
    chk('checks', '3_omit', om_omit == '' and has(om_norm, 'qa_omit'), {'omit(server Cookie)': om_omit, 'normal(server Cookie)': om_norm})
    oi = {
        "same-origin creds same-origin sends": has(srv1(OM, 'om-so'), 'qa_omit'),
        "omit response Set-Cookie not stored (doc)": not has(OM.get('afterOmitSetDoc'), 'qa_omit_set'),
        "omit response Set-Cookie not stored (http)": not has(OM.get('afterOmitSetHttp'), 'qa_omit_set'),
        "cross-origin omit sends nothing": srv1(OM, 'om-x-omit') == '',
        "cross-origin same-origin-creds sends nothing": srv1(OM, 'om-x-so') == '',
        "cross-origin XHR (no withCredentials) sends nothing": srv1(OM, 'om-x-xhr') == '',
        "cross-origin <img crossorigin=anonymous> sends nothing": srv1(OM, 'om-x-img') == '',
    }
    if armed_cfg: oi["cross-origin include: qa_om3p (unpartitioned 3P) presence == stock"] = has(srv1(OM, 'om-x-inc'), 'qa_om3p') == has(srv1((base or d)['cases'].get('OMIT', {}), 'om-x-inc'), 'qa_om3p')
    else: R['notes'].append({'stock: cross-origin include (3p cookie set w/o Partitioned)': srv1(OM, 'om-x-inc')})
    chk('indep', 'omit_extended', all(oi.values()), {k: v for k, v in oi.items()} | {'srv': {k: srv1(OM, k) for k in OM.get('srv', {})}})
    # ---------- 4 3P ----------
    srvTP = TP.get('srv', {}); g = lambda t: (srvTP.get(t) or [{}])[0].get('cookie') if srvTP.get(t) else None
    # r2: check 4 must REJECT unpartitioned third-party cookies, like stock; every 3P cookie-name set must equal stock's
    PN3 = lambda v: sorted(n for n in names(v if isinstance(v, str) else '; '.join(v) if isinstance(v, list) else '') if n.startswith('qa_3p') or n == 'qa_om3p')
    bTP = (base or d)['cases'].get('TP', {}); bsrv = bTP.get('srv', {}); bg = lambda t: (bsrv.get(t) or [{}])[0].get('cookie') if bsrv.get(t) else None
    eq3 = {}
    for t in ['tp-a-nav', 'tp-a-childecho', 'tp-a-read1', 'tp-c-read', 'tp-c-nav', 'tp-c-childecho', 'tp-b-1p', 'tp-a-read2', 'tp-a2-nav', 'tp-a2-childecho']:
        eq3['srv ' + t] = (PN3(g(t)) == PN3(bg(t)), PN3(g(t)), PN3(bg(t)))
    for part, fld in [('A1', 'cookie'), ('A1', 'store'), ('C', 'cookie'), ('C', 'store'), ('A2', 'cookie')]:
        av = ((TP.get(part) or {}).get('child') or {}).get(fld); bv = ((bTP.get(part) or {}).get('child') or {}).get(fld)
        eq3[f'{part}.child.{fld}'] = (PN3(av) == PN3(bv), PN3(av), PN3(bv))
    rej = g('tp-c-read') is not None and not has(g('tp-c-read'), 'qa_3p') and g('tp-a-read2') is not None and not has(g('tp-a-read2'), 'qa_3p') and not has(g('tp-a2-nav'), 'qa_3p')
    chk('checks', '4_3P', rej and all(v[0] for v in eq3.values()),
        {'unpartitioned qa_3p rejected (not sent back under localhost top)': rej, '[::1]top->127 fetch': g('tp-c-read'), 'localhost top->127 fetch (back)': g('tp-a-read2'), 'nameSets armed==stock': eq3})
    PN = ['qa_3p', 'qa_3p_doc', 'qa_child3p', 'qa_om3p']
    cC = (TP.get('C') or {}).get('child') or {}; cA2 = (TP.get('A2') or {}).get('child') or {}; b1p = TP.get('B1p') or {}
    ti = {
        '[::1]top 127 iframe nav request has none': g('tp-c-nav') is not None and not any(has(g('tp-c-nav'), n) for n in PN),
        '[::1]top 127 iframe fetch has none': not any(has(g('tp-c-childecho'), n) for n in PN) and g('tp-c-childecho') is not None,
        '[::1]top 127 iframe document.cookie has none': not any(has(cC.get('cookie'), n) for n in PN) and 'cookie' in cC,
        '[::1]top 127 iframe cookieStore has none': not any(n in str(cC.get('store')) for n in PN),
        '127.0.0.1 first-party top sees none of the partitioned cookies (doc)': 'doc' in b1p and not any(has(b1p.get('doc'), n) for n in PN),
        '127.0.0.1 first-party top sees none of the partitioned cookies (http)': g('tp-b-1p') is not None and not any(has(g('tp-b-1p'), n) for n in PN),
    }
    if armed_cfg:
        ti['3P name sets (Partitioned+Secure / unpartitioned / script / cookieStore) == stock in every location'] = all(v[0] for v in eq3.values())
    chk('indep', '3P_extended', all(ti.values()), {k: v for k, v in ti.items()} | {'srv': {k: g(k) for k in srvTP}, 'C.child': cC, 'A2.child': cA2, 'B1p': b1p})
    # ---------- 5 N1 ----------
    spec_steps = ['n1', 'n2', 'n3', 'n4', 'reload']; all_steps = ['n0', 'n1', 'n2', 'n3', 'n4', 'reload', 'n6', 'n7', 'back', 'reload2']
    hooks = {k: (N1.get(k) or {}).get('hook') for k in all_steps}
    want = 'get cookie' if armed_cfg else None
    if allow: want = None  # localhost allowlisted (n3 on 127.0.0.1 should still be hooked)
    if allow:
        n1ok = all(hooks[k] is None for k in spec_steps if k != 'n3') and hooks['n3'] == 'get cookie'
    else:
        n1ok = all(hooks[k] == want for k in spec_steps)
    chk('checks', '5_N1', n1ok, {'hooks': {k: hooks[k] for k in spec_steps}})
    ni = {}
    if armed_cfg and not allow:
        ni['first document (n0) hooked'] = hooks['n0'] == 'get cookie'
        ni['script nav / link click / history.back / location.reload hooked'] = all(hooks[k] == 'get cookie' for k in ['n6', 'n7', 'back', 'reload2'])
        for k in ['n0', 'n1', 'n2', 'n3', 'n4', 'reload', 'n6', 'n7', 'reload2']:
            s = N1.get(k) or {}
            ni[f'{k}: write visible to doc + sent on http'] = has(s.get('docCookie'), 'qa_' + k) and has(s.get('http'), 'qa_' + k)
            jl = webjar(d['jar'].get('n1-' + k), lan)
            ni[f'{k}: real jar empty'] = jl == []
        ni['n3 (127.0.0.1) sees no localhost cookies'] = not any(has((N1.get('n3') or {}).get('docCookie'), 'qa_' + k) for k in ['n0', 'n1', 'n2'])
        ni['n4 (back on localhost) sees n1/n2, not n3'] = has((N1.get('n4') or {}).get('docCookie'), 'qa_n1') and has((N1.get('n4') or {}).get('docCookie'), 'qa_n2') and not has((N1.get('n4') or {}).get('docCookie'), 'qa_n3')
        chk('indep', 'N1_extended', all(ni.values()), {k: v for k, v in ni.items()} | {'allHooks': hooks})
    # ---------- 6 same-origin / blank ----------
    so_ok = (SO.get('soHook') == want and SO.get('blankHook') == want and has(SO.get('topSyncAfterSo'), 'qa_so_child') and has(SO.get('soHttp'), 'qa_so_child')
             and has(SO.get('topSyncAfterBlank'), 'qa_blank') and has(SO.get('blankHttp'), 'qa_blank'))
    if allow: so_ok = has(SO.get('topSyncAfterSo'), 'qa_so_child') and has(SO.get('topSyncAfterBlank'), 'qa_blank')
    chk('checks', '6_frames', so_ok, {k: SO.get(k) for k in ['soHook', 'blankUrl', 'blankHook', 'topSyncAfterSo', 'soHttp', 'topSyncAfterBlank', 'blankHttp']})
    if armed_cfg and not allow:
        si = {'srcdoc iframe hooked': SO.get('srcdocHook') == 'get cookie', 'srcdoc write sync in top + http': has(SO.get('topSyncAfterSrcdoc'), 'qa_srcdoc') and has(SO.get('srcdocHttp'), 'qa_srcdoc'),
              'same-origin child own-script write hooked + visible in top': ((SO.get('soAsk') or {}).get('hook') == 'get cookie') and has(SO.get('topAfterSoAsk'), 'qa_so_child2'),
              'same-origin iframe re-navigation hooked': SO.get('soNav2Hook') == 'get cookie'}
        chk('indep', 'frames_extended', all(si.values()), si | {k: SO.get(k) for k in ['srcdocUrl', 'srcdocHook', 'soAsk', 'soNav2Hook']})
    # ---------- 7 staleness ----------
    chk('checks', '7_stale', has(ST.get('immediate'), 'qa_plain'), {'immediate': ST.get('immediate')})
    sti = {'iframe navigation Set-Cookie visible after onload': has(ST.get('afterIframeSet'), 'qa_ifr_set'),
           'redirect Set-Cookie sent to target + visible': has(ST.get('redirTargetHttp'), 'qa_redir') and has(ST.get('afterRedirDoc'), 'qa_redir'),
           'noopener window Set-Cookie reaches this tab mirror (3s)': has(ST.get('afterNoopenerTab'), 'qa_tab2'),
           'final http has plain/ifr/redir/xhr/tab2': all(has(ST.get('finalHttp'), n) for n in ['qa_plain', 'qa_ifr_set', 'qa_redir', 'qa_xhr', 'qa_tab2'])}
    if SEC: sti['first doc on new site (LAN): fetch Set-Cookie qa_insec visible to document.cookie after fetch resolves'] = has(SEC.get('doc'), 'qa_insec')
    for pfx in ['lp', 'lq']:
        hp = C.get('HTTP2DOC_' + pfx)
        if hp: sti[f'HTTP2DOC_{pfx}: fetch Set-Cookie visible immediately'] = all(has(hp.get('immediate'), f'{pfx}_{x}') for x in ['unset', 'lax', 'strict'])
    R['notes'].append({'sync XHR Set-Cookie visible immediately after send()': {'armed': has(ST.get('afterSyncXhr'), 'qa_xhr'), 'after500ms': has(ST.get('afterSyncXhrLater'), 'qa_xhr'),
                       'stock': has((base or d)['cases'].get('STALE', {}).get('afterSyncXhr'), 'qa_xhr')}})
    chk('indep', 'stale_extended', all(sti.values()), sti | {k: ST.get(k) for k in ['afterIframeSet', 'redirTargetHttp', 'afterRedirDoc', 'afterSyncXhr', 'afterSyncXhrLater', 'afterNoopenerTab', 'finalHttp', 'popupReturned']})
    # ---------- 8 real jar ----------
    wj = webjar(d['jar'].get('check8'), lan)
    if armed_cfg and not allow:
        chk('checks', '8_realjar', wj == [], {'webCookiesInRealJar': wj})
        alljars = {k: webjar(v, lan) for k, v in d['jar'].items() if k not in ('afterBypass',)}
        chk('indep', 'realjar_every_step', all(v == [] for v in alljars.values()), {k: v for k, v in alljars.items() if v})
    elif allow:
        chk('checks', '8_realjar', all(x.startswith('localhost|') for x in wj) and any(x.startswith('localhost|') for x in wj), {'webCookiesInRealJar': wj, 'expect': 'only localhost (allowlisted) entries'})
    else:
        chk('checks', '8_realjar', len(wj) > 0, {'webCookiesInRealJar(default: real jar used)': wj})
    # ---------- 9 synthetic ----------
    toks = {}
    for src in [B1.get('topCookie'), B2.get('ssDoc'), N1.get('n4', {}).get('docCookie')]:
        for k, v in names(src).items(): toks.setdefault(k, v[0])
    httpsrc = {}
    for src in [B1.get('topHttp'), B2.get('ssHttp')]:
        for k, v in names(src).items(): httpsrc.setdefault(k, v[0])
    R['tokens'] = toks
    if syn:
        bad = {k: v for k, v in toks.items() if ('ORIG' in v or 'MOCK' in v or 'JS_' in v or not re.fullmatch(r'[0-9A-Za-z_-]{8,}', v))}
        mism = {k: (toks[k], httpsrc[k]) for k in toks if k in httpsrc and toks[k] != httpsrc[k]}
        common = [k for k in toks if k in httpsrc]
        chk('checks', '9_synthetic', not bad and not mism and len(common) >= 4, {'nonTokenValues': bad, 'docVsHttpMismatch': mism, 'compared': common, 'seedComparison': 'cross-config, see SEEDCMP'})
    elif armed_cfg:
        rawok = all(v.startswith(('ORIG', 'CHILD', 'TP')) for k, v in toks.items())
        R['checks']['9_synthetic'] = {'ok': True, 'na': True, 'detail': {'mode': 'isolate (n/a)', 'valuesKeptRaw': rawok, 'tokens': toks}}
        chk('indep', 'isolate_values_raw', rawok, toks)
    else:
        R['checks']['9_synthetic'] = {'ok': True, 'na': True, 'detail': 'default (n/a)'}
    # ---------- default plain FF156 ----------
    sd = d.get('startDiag', {}) or {}
    ua = (N1.get('n1') or {}).get('ua'); hua = ((N1.get('n1') or {}).get('srvUA'))
    srvua = [x['ua'] for x in d.get('serverLog', []) if x.get('t') == 'n1-n1']
    R['ua'] = {'navigator': ua, 'http': srvua[:1]}
    if not armed_cfg:
        dd = {
            'UA Firefox/156.0 (navigator)': bool(ua) and ua.endswith('Firefox/156.0') and 'rv:156.0' in ua,
            'UA Firefox/156.0 (http header)': bool(srvua) and srvua[0].endswith('Firefox/156.0'),
            'darkstr.mode default homogeneous (no user value)': sd.get('darkstr.mode', {}).get('v') == 'homogeneous' and not sd.get('darkstr.mode', {}).get('user'),
            'darkstr.nativePersonaHooks default false': sd.get('darkstr.nativePersonaHooks', {}).get('v') is False,
            'darkstr.cookieFirewall.enabled default false': sd.get('darkstr.cookieFirewall.enabled', {}).get('v') is False and not sd.get('darkstr.cookieFirewall.enabled', {}).get('user'),
            'darkstr.cookieFirewall.armed false/unset (start+end)': (sd.get('darkstr.cookieFirewall.armed', {}).get('v') in (False, None)) and ((d.get('endDiag') or {}).get('darkstr.cookieFirewall.armed', {}).get('v') in (False, None)),
            'no own document.cookie on any document': all(h is None for h in hooks.values()) and SO.get('soHook') is None and SO.get('blankHook') is None and SO.get('srcdocHook') is None,
            'real jar used (cookies land in Services.cookies)': len(wj) > 0,
            'values unmodified (raw ORIG_*)': all(v.startswith(('ORIG', 'CHILD', 'TP')) for v in toks.values()),
            'HttpOnly hidden from script (stock)': hidden_ok,
            'credentials omit sends nothing (stock)': om_omit == '',
            'cross-site iframe sees no top cookies (stock TCP)': b1ok,
        }
        chk('indep', 'default_plain_ff156', all(dd.values()), dd)
    R['diag'] = {'start': {k: v.get('v') for k, v in sd.items() if 'cookieFirewall' in k or k.startswith('darkstr.mode')} if isinstance(sd, dict) else sd,
                 'end': {k: v.get('v') for k, v in (d.get('endDiag') or {}).items() if 'cookieFirewall' in k} if isinstance(d.get('endDiag'), dict) else d.get('endDiag')}
    if armed_cfg and not allow:
        ed = d.get('endDiag') or {}
        di = {'armed true': ed.get('darkstr.cookieFirewall.armed', {}).get('v') is True,
              'lastInstall status installed': 'installed' in str(ed.get('darkstr.cookieFirewall.lastInstall', {}).get('v')),
              'lastError empty': ed.get('darkstr.cookieFirewall.lastError', {}).get('v') in ('', None)}
        chk('indep', 'diag_prefs', all(di.values()), di | {'lastInstall': ed.get('darkstr.cookieFirewall.lastInstall', {}).get('v'), 'lastError': ed.get('darkstr.cookieFirewall.lastError', {}).get('v')})
    # ---------- adversarial bypass (reported separately) ----------
    R['bypass'] = {'page': BP, 'realJarAfter': webjar(d['jar'].get('afterBypass'), lan), 'cookiesSqlite': d.get('cookiesSqlite')}
    if armed_cfg and not allow:
        bpsrv = [x['cookie'] for x in d.get('serverLog', []) if x.get('t') in ('bp-e', 'bp-e2')]
        sq = str(d.get('cookiesSqlite') or '')
        f3 = {'real jar has no test-host cookie after every native path': R['bypass']['realJarAfter'] == [],
              'cookies.sqlite has no qa_native*': 'qa_native' not in sq,
              'server never received qa_native*': not any('qa_native' in c for c in bpsrv),
              'hooked document.cookie never shows qa_native*': 'qa_native' not in str(BP.get('hookedReadAfter')) + str(BP.get('hookedReadEnd')),
              'probe ran (no exception)': bool(BP) and 'exception' not in BP}
        chk('indep', 'F3_native_paths_no_realjar', all(f3.values()), f3 | {'page': BP, 'realJarAfter': R['bypass']['realJarAfter']})
    R['knownGap'] = {'armedPersonaUA(n1)': ua}
    if not armed_cfg:
        for v in R['checks'].values(): v['stock'] = True
        R['specPass'] = R['indep']['default_plain_ff156']['ok']
    else:
        R['specPass'] = all(v['ok'] for v in R['checks'].values())
    navs = d.get('navs') or {}
    chk('indep', 'harness_clean (no harnessError; every scripted navigation finished, waited from chrome ctx)', not d.get('harnessError') and len(navs) == 6 and all(navs.values()), {'harnessError': d.get('harnessError'), 'navs': navs})
    R['indepPass'] = all(v['ok'] for v in R['indep'].values())
    return R

files = sorted(f for f in RAW.glob('*.json') if not f.name.startswith(('GRADE', 'f1_', 'cs')))
data = {f.stem: json.loads(f.read_text()) for f in files}
base = data.get('default')
res = {k: grade(v, base if k != 'default' else None) for k, v in data.items()}
# seed comparison
seedcmp = {}
for a, b in [('A_syn', 'A_syn42'), ('S_syn', 'S_syn42'), ('A_syn42', 'A_syn42b'), ('A_syn42', 'S_syn42')]:
    if a in res and b in res:
        ta, tb = res[a]['tokens'], res[b]['tokens']
        common = sorted(set(ta) & set(tb))
        same = [k for k in common if ta[k] == tb[k]]
        seedcmp[f'{a} vs {b}'] = {'common': len(common), 'identical': same, 'sample': {k: (ta[k], tb[k]) for k in common[:4]}}
for a, b in [('A_syn', 'A_syn42'), ('S_syn', 'S_syn42')]:
    k = f'{a} vs {b}'
    if k in seedcmp:
        ok = seedcmp[k]['common'] >= 4 and not seedcmp[k]['identical']
        for c in (a, b):
            r = res[c]['checks'].get('9_synthetic')
            if r and not r.get('na'):
                r['detail']['seedDiffers(' + k + ')'] = ok
                r['ok'] = r['ok'] and ok
                res[c]['specPass'] = all(v['ok'] for v in res[c]['checks'].values())  # armed synthetic configs only
(OUTD / 'GRADE.json').write_text(json.dumps({'results': res, 'seedcmp': seedcmp}, indent=1, default=str) + '\n')
lines = []
order = ['1_B1', '2_B2', '3_omit', '4_3P', '5_N1', '6_frames', '7_stale', '8_realjar', '9_synthetic']
lines.append('config | ' + ' | '.join(order) + ' | spec | indep')
for c, r in res.items():
    lines.append(c + ' | ' + ' | '.join(('n/a' if r['checks'].get(o, {}).get('na') else (('stock:' if r['checks'].get(o, {}).get('stock') else '') + ('PASS' if r['checks'].get(o, {}).get('ok') else 'FAIL'))) for o in order) + f" | {'PASS' if r['specPass'] else 'FAIL'} | {'PASS' if r['indepPass'] else 'FAIL'}")
lines.append('')
for c, r in res.items():
    lines.append(f'===== {c}  harnessError={bool(r["harnessError"])}')
    for g in ('checks', 'indep'):
        for k, v in r[g].items():
            lines.append(f"  [{g}] {'PASS' if v['ok'] else 'FAIL'} {k}")
            if not v['ok'] or g == 'indep':
                det = v['detail']
                if isinstance(det, dict):
                    for kk, vv in det.items():
                        if vv is False or not v['ok']:
                            lines.append(f'       - {kk}: {json.dumps(vv, default=str)[:600]}')
    lines.append('  bypass: ' + json.dumps(r['bypass'], default=str)[:1500])
    lines.append('  UA: ' + json.dumps(r['ua']))
    for n in r['notes']: lines.append('  note: ' + json.dumps(n, default=str)[:600])
lines.append('SEEDCMP ' + json.dumps(seedcmp, indent=1))
(OUTD / 'GRADE.txt').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines[:len(res) + 2]))
