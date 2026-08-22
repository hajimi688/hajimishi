# -*- coding: utf-8 -*-
import sys
import re
import json
import time
import html as _html
import urllib.parse
import requests

sys.path.append('..')
try:
    from base.spider import Spider
except ImportError:
    class Spider:
        def fetch(self, url, headers=None, **kw):
            t = kw.pop('timeout', 20)
            r = requests.get(url, headers=headers, timeout=t, verify=False, **kw)
            r.encoding = 'utf-8'
            return r

_HOST = 'https://www.xiaoyadyw.cn'
_CATS = [
    ('dy1', '电影-热门'), ('dy2', '电影-精选'), ('dy3', '电影-经典'), ('dy4', '电影-院线'), ('dy106', '电影-珍藏'),
    ('dsj1', '电视剧-热播'), ('dsj2', '电视剧-精选'), ('dm1', '动漫'), ('zy', '综艺'),
]
_CAT_URL = {'dy1': '/dy/1/', 'dy2': '/dy/2/', 'dy3': '/dy/3/', 'dy4': '/dy/4/', 'dy106': '/dy/106/', 'dsj1': '/dsj/1/', 'dsj2': '/dsj/2/', 'dm1': '/dm/1/', 'zy': '/zy/'}


class Spider(Spider):
    host = _HOST
    ua = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'
    classes = [{'type_name': n, 'type_id': i} for i, n in _CATS]
    filters = {}

    def init(self, extend=''):
        pass

    def _get(self, u, timeout=10):
        for i in range(2):
            try:
                r = requests.get(u, headers={'User-Agent': self.ua}, timeout=timeout, verify=False)
                r.encoding = 'utf-8'
                if r.status_code == 200 and r.text:
                    return r.text
            except Exception:
                pass
            time.sleep(0.5)
        return ''

    def _pic(self, p):
        return p if p.startswith('http') else (_HOST + p if p.startswith('/') else p)

    def _items(self, html):
        out, seen = [], set()
        for m in re.finditer(r'<a href="/detail/(\d+)\.html" class="thumb">\s*<img alt="([^"]*)" src="([^"]+)"', html or ''):
            vid, title, pic = m.group(1), m.group(2), m.group(3)
            if vid in seen or not title:
                continue
            seen.add(vid)
            out.append({'vod_id': vid, 'vod_name': title, 'vod_pic': self._pic(pic), 'vod_remarks': ''})
        return out

    def getName(self):
        return '小鸭看看'

    def isVideoFormat(self, u):
        return any(x in u for x in ('.m3u8', '.mp4', '.flv'))

    def manualVideoCheck(self):
        return False

    def destroy(self):
        pass

    def homeContent(self, filter=False):
        return {'class': self.classes, 'filters': self.filters, 'list': []}

    def homeVideoContent(self):
        html = self._get(_HOST + '/')
        return {'list': self._items(html) if html else []}

    def categoryContent(self, tid, pg=1, filter=False, extend=''):
        pg = int(pg or 1)
        u = _CAT_URL.get(str(tid), '/dy/1/')
        html = self._get(_HOST + u)
        lst = self._items(html) if html else []
        if pg > 1:
            return {'page': pg, 'pagecount': 1, 'limit': len(lst) or 30, 'total': len(lst), 'list': []}
        return {'page': 1, 'pagecount': 1, 'limit': len(lst) or 30, 'total': len(lst), 'list': lst}

    def detailContent(self, ids):
        vid = str(ids[0])
        html = self._get('%s/detail/%s.html' % (_HOST, vid))
        if not html:
            return {'list': []}
        vod = {'vod_id': vid}
        hm = re.search(r'<h1>([^<]+)</h1>', html)
        vod['vod_name'] = hm.group(1).strip() if hm else ''
        im = re.search(r'<img alt="[^"]*" src="([^"]+)"', html)
        vod['vod_pic'] = self._pic(im.group(1)) if im else ''
        vod['vod_remarks'] = vod['vod_year'] = vod['vod_area'] = vod['vod_director'] = vod['vod_actor'] = vod['vod_content'] = ''
        for k, pat in (('vod_year', r'<b>年份:</b>\s*([^<]+)'), ('vod_director', r'<b>导演:</b>\s*([^<]+)'), ('vod_actor', r'<b>主演:</b>\s*([^<]+)')):
            m = re.search(pat, html)
            if m:
                vod[k] = _html.unescape(m.group(1).strip())
        ds = re.search(r'<div class="video-desc">\s*<div class="title">剧情简介</div>\s*(.*?)(?=<div class="section-hd">)', html, re.S)
        if ds:
            vod['vod_content'] = _html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', ds.group(1))).strip())
        pf, pu = [], []
        for vs in re.findall(r'<div class="video-source">\s*<span class="title">([^<]+)</span>(.*?)(?=<div class="video-source">|<div class="video-desc">)', html, re.S):
            name = vs[0].strip()
            eps = re.findall(r'href="(/bf/\d+-\d+-\d+\.html)"[^>]*>([^<]+)<', vs[1])
            if eps:
                pf.append(name)
                pu.append('#'.join('%s$%s' % (e[1].strip() or '第%d集' % (i + 1), e[0]) for i, e in enumerate(eps)))
        if not pf:
            fb = re.findall(r'href="(/bf/\d+-\d+-\d+\.html)"', html)
            if fb:
                pf.append('线路1')
                pu.append('#'.join('第%d集$%s' % (i + 1, u) for i, u in enumerate(dict.fromkeys(fb))))
        vod['vod_play_from'] = '$$$'.join(pf)
        vod['vod_play_url'] = '$$$'.join(pu)
        return {'list': [vod]}

    def searchContent(self, key, quick, pg='1'):
        try:
            r = requests.post(_HOST + '/search', data={'wd': key}, headers={'User-Agent': self.ua}, timeout=10, verify=False)
            r.encoding = 'utf-8'
            t = r.text
        except Exception:
            return {'list': []}
        out, seen = [], set()
        for m in re.finditer(r'<a href="/detail/(\d+)\.html"[^>]*class="title">([^<]+)</a>', t):
            vid, name = m.group(1), _html.unescape(m.group(2)).strip()
            if vid in seen or not name:
                continue
            seen.add(vid)
            out.append({'vod_id': vid, 'vod_name': name, 'vod_pic': '', 'vod_remarks': ''})
        if not out:
            out = self._items(t)
        return {'list': out}

    def playerContent(self, flag, id, vipFlags=None):
        u = str(id)
        if not u.startswith('http'):
            u = _HOST + u
        html = self._get(u)
        url = ''
        if html:
            m = re.search(r'https?://[^"\'\s<>]+\.m3u8[^"\'\s<>]*', html)
            if m:
                url = m.group(0).replace('\\/', '/')
        return {'parse': 0, 'url': url, 'header': {'User-Agent': self.ua}}