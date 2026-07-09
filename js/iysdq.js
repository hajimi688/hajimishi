/*
 * @File   : 影视大全.js
 * @Author : opencode
 * @Date   : 2026-07-09
 * @Desc   : 影视大全 (www.iysdq.tv) TVBox T4(JS) 源 —— 自包含，MacCMS shoutu45 模板
 *
 * 站点结构：
 *  - 服务端渲染 MacCMS(shoutu45)，首页/分类/搜索/详情 HTML 直出，无防护盾。
 *  - 分类：/vodtype/{tid}.html
 *  - 搜索：/vodsearch/{词}-------------.html   （关键词在开头，共 13 个 '-'）
 *  - 详情：/voddetail/{id}.html
 *      线路 tab: .anthology-tab a.swiper-slide（按 DOM 顺序）
 *      集数列表: 并列的多个 .anthology-list-play，按 DOM 顺序与 tab 一一对应
 *      集数链接: /vodplay/{id}-{sid}-{nid}.html
 *  - 播放：播放页 player_aaaa.url 为明文 m3u8/mp4 直链。
 *  - 卡片：div.public-list-box > a.public-list-exp[href=/voddetail/xx.html][title]
 *          封面 img data-src；备注 span.public-list-prb。
 */

var IYSDQ_VERSION = "20260709-js-1";
var HOST = "https://www.iysdq.tv";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var CLASSES = [
    { type_id: "1", type_name: "电影" },
    { type_id: "2", type_name: "电视剧" },
    { type_id: "3", type_name: "综艺" },
    { type_id: "4", type_name: "动漫" },
    { type_id: "5", type_name: "短剧" }
];

function log(msg) {
    try { console.log("[IYSDQ_JS " + IYSDQ_VERSION + "] " + msg); } catch (e) {}
}

/* ---------------- 通用工具 ---------------- */

function toStr(v) { return v === undefined || v === null ? "" : String(v); }
function encode(s) { return encodeURIComponent(toStr(s)); }

function fixUrl(u) {
    u = toStr(u).trim();
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return HOST + u;
    return u;
}

function textClean(s) {
    return toStr(s)
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#\d+;/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function attr(tag, name) {
    var r = new RegExp(name + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i");
    var m = r.exec(tag || "");
    return m ? m[2] : "";
}

function requestHtml(url) {
    try {
        log("fetch " + url);
        var res = req(url, {
            method: "GET",
            headers: { "User-Agent": UA, "Referer": HOST + "/", "Accept": "text/html" },
            timeout: 10000
        });
        var body = (typeof res === "string") ? res : (res && (res.content || res.body || res.data)) || "";
        return toStr(body);
    } catch (e) {
        log("fetch_error " + e);
        return "";
    }
}

/* ---------------- 封面提取 ---------------- */

function pickPic(tag) {
    var p = attr(tag, "data-src") || attr(tag, "data-original");
    if (!p || /img-bj-k\.png/i.test(p)) {
        var m = /<img[^>]+data-src="([^"]+)"/i.exec(tag);
        if (m) p = m[1];
    }
    return fixUrl(p);
}

/* ---------------- 列表解析 ---------------- */

// 首页/分类/搜索卡片：div.public-list-box
function parseList(html) {
    var list = [];
    var seen = {};
    // 每个卡片块：从 public-list-box 起，到下一个 public-list-box 或结束
    var re = /<div class="public-list-box[^"]*">([\s\S]*?)(?=<div class="public-list-box|<div class="null|<\/body|$)/g;
    var m;
    while ((m = re.exec(html)) !== null) {
        var block = m[1];
        var im = /href="\/voddetail\/(\d+)\.html"/.exec(block);
        if (!im) continue;
        var id = im[1];
        if (seen[id]) continue;
        seen[id] = true;

        // 标题：优先 a.public-list-exp 的 title
        var name = "";
        var tm = /class="public-list-exp"[^>]*title="([^"]*)"/.exec(block);
        if (tm) name = textClean(tm[1]);
        if (!name) {
            var tm2 = /class="time-title[^"]*"[^>]*title="([^"]*)"/.exec(block);
            if (tm2) name = textClean(tm2[1]);
        }
        if (!name) {
            var am = /alt="([^"]+?)封面图"/.exec(block) || /alt="([^"]+)"/.exec(block);
            if (am) name = textClean(am[1]);
        }

        var note = "";
        var nm = /class="public-list-prb[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(block);
        if (nm) note = textClean(nm[1]);

        list.push({ vod_id: id, vod_name: name, vod_pic: pickPic(block), vod_remarks: note });
    }
    return list;
}

/* ---------------- 接口实现 ---------------- */

function init(ext) {
    if (typeof ext === "string" && /^https?:\/\//.test(ext.trim())) {
        HOST = ext.trim().replace(/\/+$/, "");
    }
    log("init host=" + HOST);
}

function home(filter) {
    log("home");
    return JSON.stringify({ class: CLASSES });
}

function homeVod() {
    log("homeVod");
    var html = requestHtml(HOST + "/");
    var list = parseList(html).slice(0, 40);
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    tid = toStr(tid || "1");
    pg = parseInt(pg || 1);
    if (!pg || pg < 1) pg = 1;
    // 站点分类页无分页参数，首页即全量；仅第 1 页返回数据
    if (pg > 1) return JSON.stringify({ page: pg, pagecount: pg, limit: 40, total: 0, list: [] });

    var url = HOST + "/vodtype/" + tid + ".html";
    var html = requestHtml(url);
    var list = parseList(html);
    log("category tid=" + tid + " count=" + list.length);
    return JSON.stringify({
        page: 1,
        pagecount: 1,
        limit: list.length || 40,
        total: list.length,
        list: list
    });
}

function detail(id) {
    var vid = toStr(id).split(",")[0].replace(/[^\d]/g, "");
    log("detail id=" + vid);
    var html = requestHtml(HOST + "/voddetail/" + vid + ".html");
    if (!html) return JSON.stringify({ list: [] });

    // 标题
    var name = "";
    var nm = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    if (nm) name = textClean(nm[1]);
    if (!name) {
        var tt = /<title>([^<_\-]+)/.exec(html);
        if (tt) name = tt[1].trim();
    }

    // 封面
    var pic = "";
    var pm = /property="og:image"\s+content="([^"]+)"/.exec(html);
    if (pm) pic = pm[1];
    if (!pic) {
        var pm2 = /<img[^>]*class="[^"]*lazy[^"]*"[^>]*data-src="([^"]+)"/.exec(html);
        if (pm2) pic = pm2[1];
    }

    var vod = {
        vod_id: vid,
        vod_name: name,
        vod_pic: fixUrl(pic)
    };

    // 线路名（.anthology-tab 内的 a.swiper-slide，按 DOM 顺序）
    var froms = [];
    var tabStart = html.indexOf('anthology-tab');
    var tabBlock = "";
    if (tabStart >= 0) {
        var tabEnd = html.indexOf('anthology-list', tabStart);
        tabBlock = html.substring(tabStart, tabEnd > tabStart ? tabEnd : tabStart + 3000);
    }
    var fRe = /class="swiper-slide"[^>]*>([\s\S]*?)<\/a>/g;
    var fm;
    while ((fm = fRe.exec(tabBlock)) !== null) {
        var fn = textClean(fm[1]).replace(/\d+$/, "").trim();
        if (fn) froms.push(fn);
    }

    // 集数 panel：并列的 .anthology-list-play
    var playFrom = [];
    var playUrl = [];
    var panelRe = /class="anthology-list-play[^"]*"[^>]*>([\s\S]*?)<\/ul>/g;
    var pm3;
    var idx = 0;
    while ((pm3 = panelRe.exec(html)) !== null) {
        var block = pm3[1];
        var eps = [];
        var epRe = /<a[^>]*href="(\/vodplay\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
        var em;
        while ((em = epRe.exec(block)) !== null) {
            var epUrl = em[1];
            var epName = textClean(em[2]) || (eps.length + 1);
            eps.push(epName + "$" + epUrl);
        }
        if (eps.length) {
            playFrom.push(froms[idx] || ("线路" + (idx + 1)));
            playUrl.push(eps.join("#"));
        }
        idx++;
    }

    if (playFrom.length) {
        vod.vod_play_from = playFrom.join("$$$");
        vod.vod_play_url = playUrl.join("$$$");
    } else {
        vod.vod_play_from = "提示";
        vod.vod_play_url = "暂无播放源$";
    }

    return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
    var pageUrl = fixUrl(id);
    log("play flag=" + flag + " url=" + pageUrl);
    var html = requestHtml(pageUrl);

    var url = "";
    // player_aaaa = {...,"url":"https://...m3u8",...}
    var m = /player_\w+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/.exec(html);
    if (m) {
        try {
            var info = JSON.parse(m[1]);
            url = info.url || "";
        } catch (e) {
            log("player parse error " + e);
        }
    }
    // 兜底：直接搜 url 字段 / m3u8 / mp4
    if (!url) {
        var m2 = /"url"\s*:\s*"(https?:[^"]+?\.(?:m3u8|mp4)[^"]*)"/.exec(html);
        if (m2) url = m2[1];
    }
    if (!url) {
        var m3 = html.match(/https?:\/\/[^"'\s\\]+?\.m3u8[^"'\s\\]*/);
        if (m3) url = m3[0];
    }
    if (!url) {
        var m4 = html.match(/https?:\/\/[^"'\s\\]+?\.mp4[^"'\s\\]*/);
        if (m4) url = m4[0];
    }
    url = toStr(url).replace(/\\\//g, "/").trim();

    if (url && /^https?:\/\//.test(url)) {
        var header = { "User-Agent": UA, "Referer": HOST + "/" };
        return JSON.stringify({ parse: 0, url: url, header: header });
    }
    return JSON.stringify({ parse: 1, url: pageUrl });
}

function search(wd, quick, pg) {
    pg = parseInt(pg || 1);
    if (!pg || pg < 1) pg = 1;
    if (pg > 1) return JSON.stringify({ list: [], page: pg, pagecount: pg });
    log("search wd=" + wd);
    // 关键词在开头，后接 13 个 '-'
    var url = HOST + "/vodsearch/" + encode(wd) + "-------------.html";
    var html = requestHtml(url);
    var list = parseList(html);
    return JSON.stringify({ list: list, page: 1, pagecount: 1, limit: list.length, total: list.length });
}

/* ---------------- 导出 ---------------- */

__JS_SPIDER__ = {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    play: play,
    search: search
};
