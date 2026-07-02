#coding=utf-8
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TVBox / 影视仓  Python源脚本
站点: 枫叶4K影院 (guan-feng.com)
基于 MacCMS v10 模板
"""

import sys
import re
import json
import requests
from pyquery import PyQuery as pq
sys.path.append('..')
from base.spider import Spider

class Spider(Spider):

    def __init__(self):
        super().__init__()
        self.site = 'https://www.guan-feng.com'
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.guan-feng.com/'
        })
        self.cateManual = {
            '电影': '1',
            '电视剧': '2',
            '综艺': '3',
            '动漫': '4',
            '热门短剧': '5',
            '腾讯SVIP': 'label/qq',
            '优酷SVIP': 'label/youku',
            'B站SVIP': 'label/bli',
            '红果短剧': 'label/duanju'
        }

    def init(self, extend=""):
        pass

    def getName(self):
        return "枫叶4K"

    def isVideoFormat(self, url):
        pass

    def manualVideoCheck(self):
        pass

    def homeContent(self, filter):
        result = {'class': [], 'filters': {}, 'list': [], 'parse': 0, 'jx': 0}
        for k, v in self.cateManual.items():
            result['class'].append({
                'type_id': str(v),
                'type_name': k
            })
        return result

    def homeVideoContent(self):
        videos = []
        try:
            r = self.session.get(self.site, timeout=15)
            r.encoding = 'utf-8'
            doc = pq(r.text)
            items = doc('a.module-poster-item.module-item')
            seen = set()
            for item in items.items():
                href = item.attr('href') or ''
                vid = self.getVid(href)
                if not vid or vid in seen:
                    continue
                seen.add(vid)
                title = item.find('.module-poster-item-title').text().strip()
                img = item.find('img')
                pic = img.attr('data-src') or img.attr('src') or ''
                if 'null.jpg' in pic:
                    pic = ''
                note = item.find('.module-item-note').text().strip()
                if title:
                    videos.append({
                        'vod_id': vid,
                        'vod_name': title,
                        'vod_pic': pic,
                        'vod_remarks': note
                    })
        except Exception as e:
            print(f'homeVideoContent error: {e}')
        return {'list': videos, 'parse': 0, 'jx': 0}

    def categoryContent(self, tid, pg, filter, extend):
        result = {'list': [], 'parse': 0, 'jx': 0}
        page = int(pg) if pg else 1
        try:
            if str(tid).startswith('label/'):
                if page == 1:
                    url = f'{self.site}/{tid}.html'
                else:
                    url = f'{self.site}/{tid}-{page}.html'
            else:
                if page == 1:
                    url = f'{self.site}/type/{tid}.html'
                else:
                    url = f'{self.site}/type/{tid}-{page}.html'

            r = self.session.get(url, timeout=15)
            r.encoding = 'utf-8'
            doc = pq(r.text)
            items = doc('a.module-poster-item.module-item')
            for item in items.items():
                href = item.attr('href') or ''
                vid = self.getVid(href)
                if not vid:
                    continue
                title = item.find('.module-poster-item-title').text().strip()
                img = item.find('img')
                pic = img.attr('data-src') or img.attr('src') or ''
                if 'null.jpg' in pic:
                    pic = ''
                note = item.find('.module-item-note').text().strip()
                if title:
                    result['list'].append({
                        'vod_id': vid,
                        'vod_name': title,
                        'vod_pic': pic,
                        'vod_remarks': note
                    })
        except Exception as e:
            print(f'categoryContent error: {e}')

        result['page'] = page
        result['pagecount'] = page + 1 if len(result['list']) > 0 else page
        result['limit'] = len(result['list'])
        result['total'] = len(result['list'])
        return result

    def detailContent(self, ids):
        result = {'list': [], 'parse': 0, 'jx': 0}
        vid = ids[0] if ids else ''
        if not vid:
            return result
        try:
            url = f'{self.site}/detail/{vid}.html'
            r = self.session.get(url, timeout=15)
            r.encoding = 'utf-8'
            doc = pq(r.text)

            title = doc('h1.intro-drawer-title').text().strip()
            if not title:
                title = doc('h1').text().strip()

            pic = doc('.intro-drawer-poster img').attr('data-src') or ''
            if not pic or 'null.jpg' in pic:
                pic = doc('.intro-drawer-poster img').attr('src') or ''
                if 'null.jpg' in pic:
                    pic = ''

            desc = doc('.intro-drawer-desc-content').text().strip()

            actor = ''
            director = ''
            for row in doc('.intro-drawer-row').items():
                label = row.find('.intro-drawer-label').text().strip()
                value = row.find('.intro-drawer-value').text().strip()
                if '演员' in label or '主演' in label:
                    actor = value
                elif '导演' in label:
                    director = value

            play_from = []
            play_url = []

            tabs = doc('.mx-anthology-tab')
            panels = doc('.mx-anthology-panel')

            tab_list = []
            panel_list = []
            for t in tabs.items():
                tab_list.append(t)
            for p in panels.items():
                panel_list.append(p)

            for i, tab in enumerate(tab_list):
                tab_name = tab.find('.mx-anthology-tab-label').text().strip() or f'线路{i+1}'
                play_from.append(tab_name)

                episodes = []
                if i < len(panel_list):
                    for link in panel_list[i].find('a.mx-anthology-link').items():
                        ep_name = link.text().strip()
                        ep_href = link.attr('href') or ''
                        if ep_name and ep_href:
                            episodes.append(f'{ep_name}${ep_href}')

                play_url.append('#'.join(episodes))

            vod = {
                'vod_id': vid,
                'vod_name': title,
                'vod_pic': pic,
                'type_name': '',
                'vod_year': '',
                'vod_area': '',
                'vod_remarks': '',
                'vod_actor': actor,
                'vod_director': director,
                'vod_content': desc,
                'vod_play_from': '$$$'.join(play_from) if play_from else '',
                'vod_play_url': '$$$'.join(play_url) if play_url else ''
            }
            result['list'].append(vod)
        except Exception as e:
            print(f'detailContent error: {e}')
        return result

    def playerContent(self, flag, id, vipFlags):
        result = {}
        try:
            play_url = id
            if id and not id.startswith('http'):
                play_url = self.site + id

            r = self.session.get(play_url, timeout=15)
            r.encoding = 'utf-8'

            iframe_url = ''
            m = re.search(r'src="(https?://[^"]+/player/\?url=[^"]+)"', r.text)
            if m:
                iframe_url = m.group(1)
            else:
                m2 = re.search(r'<iframe[^>]+src="([^"]+/player/\?url=[^"]+)"', r.text)
                if m2:
                    iframe_url = m2.group(1)

            if iframe_url:
                result['parse'] = 1
                result['url'] = iframe_url
                result['jx'] = 0
                result['header'] = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': self.site + '/'
                }
            else:
                result['parse'] = 1
                result['url'] = play_url
                result['jx'] = 0
                result['header'] = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': self.site + '/'
                }
        except Exception as e:
            print(f'playerContent error: {e}')
            result['parse'] = 1
            result['url'] = id
            result['jx'] = 0
            result['header'] = {}
        return result

    def searchContent(self, key, quick, pg='1'):
        result = {'list': [], 'parse': 0, 'jx': 0}
        page = int(pg) if pg else 1
        try:
            url = f'{self.site}/cupfox-search/-------------.html'
            params = {'wd': key}
            if page > 1:
                params['page'] = page

            r = self.session.get(url, params=params, timeout=15)
            r.encoding = 'utf-8'
            doc = pq(r.text)

            items = doc('div.module-card-item.module-item')
            for item in items.items():
                poster_a = item.find('a.module-card-item-poster')
                vid = self.getVid(poster_a.attr('href') or '')
                if not vid:
                    continue

                title = poster_a.attr('title') or item.find('.module-card-item-title strong').text().strip()
                if not title:
                    title = item.find('.module-card-item-title').text().strip()

                img = item.find('img')
                pic = img.attr('data-src') or img.attr('src') or ''
                if 'null.jpg' in pic:
                    pic = ''

                note = item.find('.module-item-note').text().strip()
                if title:
                    result['list'].append({
                        'vod_id': vid,
                        'vod_name': title,
                        'vod_pic': pic,
                        'vod_remarks': note
                    })
        except Exception as e:
            print(f'searchContent error: {e}')
        return result

    def localProxy(self, params):
        return [200, "video/MP2T", {}, ""]

    def getVid(self, url):
        if not url:
            return ''
        m = re.search(r'/detail/(\d+)\.html', url)
        if m:
            return m.group(1)
        m = re.search(r'/play/(\d+)-', url)
        if m:
            return m.group(1)
        return ''
