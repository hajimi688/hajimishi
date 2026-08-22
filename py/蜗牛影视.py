# -*- coding: utf-8 -*-
import sys
import re
import json
import socket
from urllib.parse import urljoin, quote, unquote

sys.path.append('..')
try:
    from base.spider import Spider
except ImportError:
    class Spider:
        def fetch(self, url, headers=None, **kw):
            import requests as rq
            kw.pop('timeout', None)
            r = rq.get(url, headers=headers, timeout=15, **kw)
            r.encoding = 'utf-8'
            return r

HOST = "https://www.snailok.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

CATEGORIES = {
    "1": "韩剧", "2": "美剧", "3": "中国剧", "4": "日剧", "5": "泰剧",
    "6": "港台剧", "7": "短剧", "8": "综艺", "9": "动漫", "10": "电影", "11": "纪录片",
}

try:
    from curl_cffi import requests as _cffi
    _CFFI = True
except:
    _CFFI = False

class Spider(Spider):
    def _fetch_page(self, url):
        socket.setdefaulttimeout(8)
        headers = {'User-Agent': UA, 'Referer': HOST + '/', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9'}
        for i in range(2):
            try:
                if _CFFI:
                    r = _cffi.get(url, impersonate='chrome124', headers=headers, timeout=10)
                else:
                    r = self.fetch(url, headers=headers, timeout=10000)
                r.encoding = 'utf-8'
                txt = r.text if hasattr(r, 'text') else str(r)
                if txt or i:
                    return txt
            except:
                pass
            socket.setdefaulttimeout(6)
        return ''
    def init(self, extend=""):
        global HOST
        try:
            r = self.fetch(HOST, headers={"User-Agent": UA}, timeout=15000)
            if hasattr(r, 'url') and r.url and r.url != HOST.rstrip("/"):
                HOST = r.url.rstrip("/")
        except:
            pass

    def homeContent(self, filter=False):
        r = {"class": [], "list": []}
        for k, v in CATEGORIES.items():
            r["class"].append({"type_id": k, "type_name": v})
        return r

    def homeVideoContent(self):
        try:
            r = self.fetch(HOST, headers={"User-Agent": UA}, timeout=15000)
            html = r.text if hasattr(r, 'text') else str(r)
            return {"list": self._items(html)}
        except:
            return {"list": []}

    def categoryContent(self, tid, pg=1, filter=False, extend=""):
        pn = 1
        try:
            pn = max(int(str(pg)), 1)
        except:
            pass
        cat = str(tid)
        if cat not in CATEGORIES:
            cat = "1"
        try:
            url = f"{HOST}/s/{cat}.html" if pn == 1 else f"{HOST}/s/{cat}-{pn}.html"
            r = self.fetch(url, headers={"User-Agent": UA}, timeout=30000)
            html = r.text if hasattr(r, 'text') else str(r)
            items = self._items(html)
            return {
                "page": pn,
                "pagecount": self._pagecount(html, pn),
                "limit": 36,
                "total": len(items),
                "list": items
            }
        except:
            return {"page": pn, "pagecount": 1, "limit": 36, "total": 0, "list": []}

    def detailContent(self, ids):
        if isinstance(ids, list):
            vid = ids[0] if ids else ""
        else:
            vid = str(ids) if ids else ""
        m = re.search(r'(\d+)', str(vid))
        vid = m.group(1) if m else ""
        if not vid:
            return {"list": []}
        try:
            r = self.fetch(f"{HOST}/n/{vid}.html", headers={"User-Agent": UA}, timeout=30000)
            h = r.text if hasattr(r, 'text') else str(r)
        except:
            return {"list": []}

        d = {
            "vod_id": vid, "vod_name": "", "vod_pic": "", "vod_year": "",
            "vod_area": "", "vod_class": "", "vod_director": "", "vod_actor": "",
            "vod_content": "", "vod_remarks": "", "vod_play_from": "", "vod_play_url": ""
        }

        # 标题
        tn = re.search(r'<h1[^>]*>\s*<span>([^<]+)</span>', h)
        if not tn:
            tn = re.search(r'<h1[^>]*>(.*?)</h1>', h)
        if not tn:
            tn = re.search(r'<title>(.*?)</title>', h)
            if tn:
                d["vod_name"] = tn.group(1).split("-")[0].replace("免费在线观看", "").replace("高清完整版", "").replace("《", "").replace("》", "").strip()
        if tn and not d["vod_name"]:
            d["vod_name"] = re.sub(r'<[^>]+>', '', tn.group(1)).strip()

        # 封面
        p = re.search(r'data-original="(https?://[^"]+\.(?:jpg|jpeg|png|webp))"', h, re.I)
        if not p:
            p = re.search(r'<img[^>]*(?:data-original|src)="(https?://[^"]+\.(?:jpg|jpeg|png|webp))"', h, re.I)
        if p:
            d["vod_pic"] = self._fix_pic(p.group(1))

        # 简介
        desc_m = re.search(r'id="desc"[^>]*>([\s\S]*?)</', h)
        if not desc_m:
            desc_m = re.search(r'class="article-content"[^>]*>([\s\S]*?)</div>', h)
        if desc_m:
            d["vod_content"] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', desc_m.group(1))).strip()[:500]

        # 年份/地区
        ym = re.search(r'上映于(\d{4})年([\u4e00-\u9fa5]+)地区', h)
        if ym:
            d["vod_year"] = ym.group(1)
            d["vod_area"] = ym.group(2)

        # 分类
        cm = re.search(r'》([\u4e00-\u9fa5]{2,6})免费', h)
        if not cm:
            cm = re.search(r'类型[：:]?\s*([^<\n]+?)(?:\s|</)', h)
        if cm:
            d["vod_class"] = cm.group(1).strip()

        # 导演
        dm = re.search(r'导演([\u4e00-\u9fa5]+)倾情执导', h)
        if not dm:
            dm = re.search(r'导演[：:]?\s*([^<\n]+?)(?:\s|</)', h)
        if dm:
            d["vod_director"] = dm.group(1).strip().rstrip('，').strip()

        # 主演
        am2 = re.search(r'由([^<]+?)等主演', h)
        if not am2:
            am2 = re.search(r'(?:演员|主演)[：:]?\s*([^<\n]+?)(?:\s|</)', h)
        if am2:
            d["vod_actor"] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', am2.group(1))).strip().rstrip('，').strip()

        # 备注/状态
        rm = re.search(r'更新[至到]?\s*([^<\n]+?)(?:\s|</)', h)
        if rm and ('时间' in rm.group(1) or '日期' in rm.group(1)):
            rm = re.search(r'更新[至到]\s*(第?[\d一二三四五六七八九十百千]+集[^<\n]{0,10})', h)
        if not rm:
            rm = re.search(r'class="pic-text[^"]*"[^>]*>([^<]+)<', h)
        if rm:
            d["vod_remarks"] = rm.group(1).strip()

        # 播放源
        try:
            pf, pu = [], []
            # 线路名: tab 锚点编号-1 = sid（锚点 #playlist2 对应 sid1，非显示顺序）
            tab_area = re.search(r'class="[^"]*(?:nav-tabs|play-tab|tab-list)[^"]*"[\s\S]*?</div>', h)
            tab_map = {}
            if tab_area:
                for sid_a, tname in re.findall(r'<a[^>]*href="#playlist(\d+)"[^>]*>([\s\S]*?)</a>', tab_area.group(0)):
                    clean = re.sub(r'<[^>]+>', '', tname).strip()
                    if clean and '排序' not in clean and '报错' not in clean and len(clean) < 20:
                        tab_map[int(sid_a) - 1] = clean

            # 播放列表: 全局 /k/ 链接按 sid 分组，tab_map 按 sid 取名
            play_urls = re.findall(r'href="(/k/(\d+)-(\d+)-(\d+)\.html)"[^>]*>([^<]+)<', h)
            routes = {}
            for href, vid2, sid, nid, ep in play_urls:
                if '立即' in ep:
                    continue
                routes.setdefault(sid, []).append((int(nid), href, ep.strip()))
            for i, sid in enumerate(sorted(routes.keys(), key=lambda x: (0 if tab_map.get(int(x), '') == 'yun' else 1, int(x) if x.isdigit() else 999))):
                name = tab_map.get(int(sid)) if tab_map else None
                if not name:
                    name = "线路" + str(int(sid) + 1)
                pf.append(name)
                items = sorted(routes[sid])
                pu.append("#".join([f"{ep}${urljoin(HOST, href)}" for _, href, ep in items]))

            # 兜底: 全局 /k/ 链接按线路分组（无 tab 时）
            if not pf:
                play_urls = re.findall(r'href="(/k/\d+-(\d+)-\d+\.html)"[^>]*>([^<]+)</a>', h)
                routes = {}
                for href, route, ep in play_urls:
                    if '立即' in ep:
                        continue
                    if route not in routes:
                        routes[route] = []
                    routes[route].append(f"{ep.strip()}${urljoin(HOST, href)}")
                route_idx = 0
                for route in sorted(routes.keys(), key=lambda x: int(x) if x.isdigit() else 999):
                    name = "线路" + str(int(route) + 1)
                    pf.append(name)
                    pu.append("#".join(routes[route]))
                    route_idx += 1

            if pf:
                d["vod_play_from"] = "$$$".join(pf)
                d["vod_play_url"] = "$$$".join(pu)
        except:
            pass

        return {"list": [d]}

    def searchContent(self, key, quick=False, pg="1"):
        try:
            pn = 1
            try:
                pn = int(str(pg))
            except:
                pass
            url = f"{HOST}/search.php?searchword={quote(key)}"
            r = self.fetch(url, headers={"User-Agent": UA}, timeout=30000)
            html = r.text if hasattr(r, 'text') else str(r)
            items = self._items(html)
            return {"list": items, "page": pn}
        except:
            return {"list": []}

    def playerContent(self, flag, id, vipFlags=None):
        url = str(id) if id else str(flag)
        if url.startswith("http") and (".m3u8" in url or ".mp4" in url):
            return {"url": url}
        if not url.startswith("http"):
            url = urljoin(HOST, url)
        h = self._fetch_page(url)
        if not h:
            return {"url": ""}
        now = re.search(r'var now="(https?://[^"]+)"', h)
        if not now:
            m = re.search(r'(https?://[^\s"\'<>]+\.m3u8)', h)
            return {"url": m.group(1)} if m else {"url": ""}
        page = now.group(1)
        if ".m3u8" in page or ".mp4" in page:
            return {"url": page}
        h2 = self._fetch_page(page)
        if h2:
            m = re.search(r'const url = "([^"]+)"', h2)
            if m:
                return {"url": urljoin(page, m.group(1))}
            m = re.search(r"const vid = '([^']+)'", h2)
            if m:
                return {"url": urljoin(page, m.group(1))}
            m = re.search(r'var\s+(?:videoUrl|vurl|url|now)\s*=\s*["\']([^"\']+\.(?:m3u8|mp4)[^"\']*)["\']', h2)
            if m:
                return {"url": m.group(1)}
            m = re.search(r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)', h2)
            if m:
                return {"url": m.group(1)}
            m = re.search(r'(https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*)', h2)
            if m:
                return {"url": m.group(1)}
        try:
            r3 = self.fetch(page + "/index.m3u8", headers={"User-Agent": UA, "Referer": HOST}, timeout=10000)
            if hasattr(r3, 'status_code') and r3.status_code == 200:
                body = r3.text if hasattr(r3, 'text') else str(r3)
                if "EXTM3U" in body:
                    return {"url": page + "/index.m3u8"}
        except:
            pass
        return {"url": ""}

    def localProxy(self, param):
        args = param.split("&") if param else []
        url = ""
        for a in args:
            if a.startswith("url="):
                url = unquote(a[4:])
        if not url:
            return None
        headers = {"User-Agent": UA, "Referer": HOST}
        try:
            r = self.fetch(url, headers=headers, timeout=20000)
            if hasattr(r, 'status_code') and r.status_code != 200:
                raise Exception("http %s" % r.status_code)
            if ".m3u8" in url:
                body = r.text if hasattr(r, 'text') else str(r)
                base = url.rsplit("/", 1)[0] + "/"
                lines = []
                for ln in body.splitlines():
                    if ln.startswith("#EXT-X-KEY"):
                        m = re.search(r'URI="([^"]+)"', ln)
                        if m:
                            ku = m.group(1) if m.group(1).startswith("http") else base + m.group(1)
                            ln = ln.replace('URI="%s"' % m.group(1), 'URI="%s"' % ("proxy?url=" + quote(ku)))
                    elif ln.startswith("http"):
                        ln = "proxy?url=" + quote(ln)
                    lines.append(ln)
                return {"code": 200, "header": {"Content-Type": "application/vnd.apple.mpegurl"}, "content": "\n".join(lines)}
            return r
        except:
            if "hhmage.com" in url:
                try:
                    return self.fetch("https://images.weserv.nl/?url=" + url.replace("https://", ""), headers={"User-Agent": UA}, timeout=20000)
                except:
                    return None
            return None

    def _pagecount(self, html, current_page=1):
        pages = re.findall(r'href="/s/\d+-(\d+)\.html"', html)
        max_page = current_page
        for p in pages:
            try:
                n = int(p)
                if n > max_page:
                    max_page = n
            except:
                pass
        return max_page

    def _fix_pic(self, url):
        if not url:
            return ""
        url = url.replace("http://", "https://")
        if "hhmage.com" in url:
            return "https://images.weserv.nl/?url=" + url.replace("https://", "").replace("http://", "")
        return url

    def _items(self, html):
        items, seen = [], set()
        # 匹配 n/详情 链接 + title
        for m in re.finditer(r'href="(/n/(\d+)\.html)"[^>]*title="([^"]*)"', html):
            vid = m.group(2)
            if vid in seen:
                continue
            name = m.group(3).strip()
            if not name or len(name) > 100:
                continue
            before = html[max(0, m.start() - 800):m.start()]
            after = html[m.end():m.end() + 800]
            # 封面: data-original / original / src (前后800字符双查)
            cover = re.search(r'(?:data-original|original|src)="(https?://[^"]+\.(?:jpg|jpeg|png|webp))"', before + after, re.I)
            # 备注: pic-text / note / text
            remark = re.search(r'class="pic-text[^"]*"[^>]*>([^<]+)<', before + after)
            if not remark:
                remark = re.search(r'class="[^"]*(?:note|text|remark)[^"]*"[^>]*>([^<]+)<', before + after, re.I)
            seen.add(vid)
            items.append({
                "vod_id": vid,
                "vod_name": name[:50],
                "vod_pic": self._fix_pic(cover.group(1) if cover else ""),
                "vod_remarks": remark.group(1).strip() if remark else "",
            })
        return items