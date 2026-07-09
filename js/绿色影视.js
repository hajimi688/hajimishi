/*
 * @File   : 绿色影视.js
 * @Desc   : 绿色影视 (lvsc168.com) TVBox T4(JS) 源 —— 自包含，无外部依赖
 *
 * 站点结构：
 *  - MYUI 模板 (苹果/海洋CMS 前端)，无开放 API，纯网页解析，页面编码 UTF-8。
 *  - URL 规律：
 *      分类  /frim/{tid}-{pg}.html
 *      详情  /movie/{id}.html
 *      搜索  /search.php?searchword={kw}&page={pg}
 *      播放  /play/{vid}-{from}-{ep}.html
 *  - 列表卡片：<a class="myui-vodlist__thumb" href="/movie/ID.html" title=""
 *      style="background: url(/img.php?url=真实图)"> ... <span class="pic-text">备注</span>
 *  - 详情信息在 p.data 里，一个 p 含多个「键：值」(分类/地区/年份/主演/导演/更新)。
 *  - 播放核心：播放页 <script> 内 `var now=base64decode("BASE64")`，
 *      解出二级播放页 (如 cdn.ryplay10.com/share/xxx)，页面用 DPlayer/Artplayer
 *      加载带 sign 签名的 m3u8。二级页地址交给 TVBox 嗅探 (parse:1) 取真实直链。
 */

var LVSC_VERSION = "20260709-js-1";
var HOST = "https://www.lvsc168.com";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var HEADERS = {
    "User-Agent": UA,
    "Referer": HOST + "/",
    "Accept-Encoding": "identity"
};

var CLASSES = [
    { type_id: "1", type_name: "电影" },
    { type_id: "2", type_name: "电视剧" },
    { type_id: "3", type_name: "综艺" },
    { type_id: "4", type_name: "动漫" },
    { type_id: "26", type_name: "短剧" },
    { type_id: "27", type_name: "泰剧" },
    { type_id: "5", type_name: "动作片" },
    { type_id: "6", type_name: "爱情片" },
    { type_id: "7", type_name: "科幻片" },
    { type_id: "8", type_name: "恐怖片" },
    { type_id: "9", type_name: "战争片" },
    { type_id: "10", type_name: "喜剧片" },
    { type_id: "11", type_name: "纪录片" },
    { type_id: "12", type_name: "剧情片" },
    { type_id: "13", type_name: "大陆剧" },
    { type_id: "14", type_name: "港台剧" },
    { type_id: "15", type_name: "欧美剧" },
    { type_id: "16", type_name: "日韩剧" }
];

function log(msg) {
    try { console.log("[LVSC_JS " + LVSC_VERSION + "] " + msg); } catch (e) {}
}

/* ---------------- 通用工具 ---------------- */

function toStr(v) { return v === undefined || v === null ? "" : String(v); }

function requestText(url, referer) {
    var h = {};
    for (var k in HEADERS) h[k] = HEADERS[k];
    if (referer) h.Referer = referer;
    try {
        log("fetch " + url);
        var res = req(url, { method: "GET", headers: h, timeout: 8000 });
        if (typeof res === "string") return res;
        return (res && (res.content || res.body || res.data)) || "";
    } catch (e) {
        log("fetch_error " + url + " " + e);
        return "";
    }
}

function fixUrl(u) {
    if (!u) return "";
    u = toStr(u).trim().replace(/^["']|["']$/g, "");
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return HOST + u;
    return u;
}

function textClean(s) {
    return toStr(s)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function attr(tag, name) {
    var r = new RegExp(name + "\\s*=\\s*([\"'])([\\s\\S]*?)\\1", "i");
    var m = r.exec(tag || "");
    return m ? m[2] : "";
}

// 从 style="background: url(XXX)" 提取图片地址
function picFromStyle(style) {
    if (!style) return "";
    var m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(style);
    return m ? m[1] : "";
}

/* ---------------- 列表解析 (MYUI vodlist) ---------------- */

function parseList(html) {
    var list = [];
    var seen = {};
    if (!html) return list;
    // 匹配每个 <a class="...myui-vodlist__thumb..." ...>...</a>
    var re = /<a\b[^>]*class=["'][^"']*myui-vodlist__thumb[^"']*["'][^>]*>[\s\S]*?<\/a>/g;
    var m;
    while ((m = re.exec(html)) !== null) {
        var tag = m[0];
        var href = attr(tag, "href");
        var idm = /\/movie\/(\d+)\.html/.exec(href);
        if (!idm) continue;
        var id = idm[1];
        if (seen[id]) continue;
        seen[id] = true;
        var name = attr(tag, "title") || textClean(tag);
        // 图片优先 style 背景, 再 data-original
        var pic = picFromStyle(attr(tag, "style")) || attr(tag, "data-original") || attr(tag, "data-src") || attr(tag, "src");
        var remark = "";
        var rm = /<span\b[^>]*class=["'][^"']*pic-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(tag);
        if (rm) remark = textClean(rm[1]);
        list.push({
            vod_id: "/movie/" + id + ".html",
            vod_name: name,
            vod_pic: fixUrl(pic),
            vod_remarks: remark
        });
    }
    return list;
}

/* ---------------- 接口实现 ---------------- */

function init(ext) {
    if (typeof ext === "string" && /^https?:\/\//.test(ext.trim())) {
        HOST = ext.trim().replace(/\/+$/, "");
        HEADERS.Referer = HOST + "/";
    }
    log("init host=" + HOST);
}

function home(filter) {
    log("home");
    return JSON.stringify({ class: CLASSES });
}

function homeVod() {
    log("homeVod");
    var html = requestText(HOST + "/");
    return JSON.stringify({ list: parseList(html) });
}

function category(tid, pg, filter, extend) {
    tid = toStr(tid || "1");
    pg = parseInt(pg || 1);
    if (!pg || pg < 1) pg = 1;
    var url = HOST + "/frim/" + tid + "-" + pg + ".html";
    var html = requestText(url);
    var list = parseList(html);
    log("category tid=" + tid + " pg=" + pg + " count=" + list.length);
    return JSON.stringify({
        page: pg,
        pagecount: list.length > 0 ? pg + 1 : pg,
        limit: 40,
        total: 999999,
        list: list
    });
}

function detail(id) {
    var vid = toStr(id).split(",")[0];
    var url = vid.indexOf("http") === 0 ? vid : HOST + vid;
    log("detail id=" + vid);
    var html = requestText(url);
    if (!html) return JSON.stringify({ list: [] });

    // 名称
    var name = "";
    var nm = /<h1\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (nm) name = textClean(nm[1]);

    // 大图: .myui-content__thumb 内 img@data-original
    var pic = "";
    var thumbBlock = /<div\b[^>]*class=["'][^"']*myui-content__thumb[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
    if (thumbBlock) {
        var imgTag = /<img\b[^>]*>/i.exec(thumbBlock[1]);
        if (imgTag) pic = attr(imgTag[0], "data-original") || attr(imgTag[0], "src");
        if (!pic) {
            var aTag = /<a\b[^>]*>/i.exec(thumbBlock[1]);
            if (aTag) pic = picFromStyle(attr(aTag[0], "style"));
        }
    }

    // 基本信息: 所有 <p class="data ...">键：值 键：值</p>
    var mp = {};
    var KEYS = ["分类", "类型", "地区", "年份", "主演", "导演", "更新", "备注", "语言", "状态", "别名", "首播"];
    var keyRe = new RegExp("(" + KEYS.join("|") + ")[:：]", "g");
    var pRe = /<p\b[^>]*class=["'][^"']*\bdata\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
    var pm;
    while ((pm = pRe.exec(html)) !== null) {
        var t = textClean(pm[1]);
        var marks = [];
        var km;
        keyRe.lastIndex = 0;
        while ((km = keyRe.exec(t)) !== null) {
            marks.push({ key: km[1], s: km.index, vs: km.index + km[0].length });
        }
        for (var q = 0; q < marks.length; q++) {
            var end = (q + 1 < marks.length) ? marks[q + 1].s : t.length;
            var val = t.substring(marks[q].vs, end).trim();
            if (val && !mp[marks[q].key]) mp[marks[q].key] = val;
        }
    }

    // 简介: <p class="desc ...">简介：内容</p>
    var content = "";
    var dm = /<p\b[^>]*class=["'][^"']*\bdesc\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(html);
    if (dm) content = textClean(dm[1]).replace(/^\s*简介\s*[:：]?\s*/, "");

    // 播放线路: 只取 tab href=#playlistN 的, 排除 #type(同类型推荐)
    var tabNames = {};   // pid -> 显示名
    var tabRe = /<a\b[^>]*href=["']#(playlist\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var tm;
    var order = [];
    while ((tm = tabRe.exec(html)) !== null) {
        var pid = tm[1];
        if (!tabNames.hasOwnProperty(pid)) {
            tabNames[pid] = textClean(tm[2]) || ("线路" + (order.length + 1));
            order.push(pid);
        }
    }

    var playFrom = [];
    var playUrl = [];
    for (var oi = 0; oi < order.length; oi++) {
        var curPid = order[oi];
        // 提取 <div id="playlistN" ...> ... </div> 块内的剧集
        var block = extractPaneById(html, curPid);
        if (!block) continue;
        var eps = [];
        var seenEp = {};
        var aRe = /<a\b[^>]*href=["']([^"']*\/play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        var am;
        while ((am = aRe.exec(block)) !== null) {
            var epUrl = am[1];
            if (seenEp[epUrl]) continue;
            seenEp[epUrl] = true;
            var epName = textClean(am[2]) || ("第" + (eps.length + 1) + "集");
            eps.push(epName + "$" + epUrl);
        }
        if (eps.length) {
            playFrom.push(tabNames[curPid]);
            playUrl.push(eps.join("#"));
        }
    }

    var vod = {
        vod_id: vid,
        vod_name: name,
        vod_pic: fixUrl(pic),
        vod_year: mp["年份"] || "",
        vod_area: mp["地区"] || "",
        vod_lang: mp["语言"] || "",
        type_name: mp["类型"] || mp["分类"] || "",
        vod_actor: mp["主演"] || "",
        vod_director: mp["导演"] || "",
        vod_remarks: mp["更新"] || mp["备注"] || mp["状态"] || "",
        vod_content: content
    };

    if (playFrom.length) {
        vod.vod_play_from = playFrom.join("$$$");
        vod.vod_play_url = playUrl.join("$$$");
    } else {
        vod.vod_play_from = "提示";
        vod.vod_play_url = "暂无播放源$";
    }

    return JSON.stringify({ list: [vod] });
}

// 从 html 中提取 <div id="playlistN" ...>...</div> 的内容 (处理嵌套 div)
function extractPaneById(html, pid) {
    var startRe = new RegExp('<div\\b[^>]*id=["\']' + pid + '["\'][^>]*>', "i");
    var sm = startRe.exec(html);
    if (!sm) return "";
    var start = sm.index + sm[0].length;
    // 从 start 起做 div 深度匹配
    var depth = 1;
    var re = /<\/?div\b[^>]*>/gi;
    re.lastIndex = start;
    var m;
    while ((m = re.exec(html)) !== null) {
        if (m[0].indexOf("</") === 0) {
            depth--;
            if (depth === 0) return html.substring(start, m.index);
        } else {
            depth++;
        }
    }
    return html.substring(start);
}

function play(flag, id, flags) {
    var raw = toStr(id);
    var url = raw.indexOf("http") === 0 ? raw : HOST + raw;
    log("play flag=" + flag + " id=" + raw.slice(0, 80));
    var html = requestText(url, HOST + "/");

    var realUrl = "";

    // 关键: 播放页 <script> 内 var now=base64decode("BASE64");
    var m = /var\s+now\s*=\s*base64decode\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/.exec(html);
    if (m && m[1]) {
        realUrl = b64decode(m[1]);
    }
    // 兼容: now 直接明文地址
    if (!realUrl) {
        var m2 = /var\s+now\s*=\s*["'](https?:[^"']+)["']/.exec(html);
        if (m2) realUrl = m2[1];
    }

    var header = { "User-Agent": UA, "Referer": HOST + "/" };

    // 已是媒体直链 -> 直接播放
    if (realUrl && /\.(m3u8|mp4|flv|m4a|mp3|ts)(\?|#|$)/i.test(realUrl)) {
        return JSON.stringify({ parse: 0, url: realUrl, header: header });
    }
    // 二级播放页 -> 交嗅探
    if (realUrl && realUrl.indexOf("http") === 0) {
        return JSON.stringify({ parse: 1, url: realUrl, header: header });
    }

    // 兜底: 整页正则找直链
    var pats = [
        /(https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*)/,
        /(https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*)/,
        /["']url["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/
    ];
    for (var p = 0; p < pats.length; p++) {
        var mm = pats[p].exec(html);
        if (mm) return JSON.stringify({ parse: 0, url: mm[1].replace(/\\\//g, "/"), header: header });
    }

    // 实在没有 -> 嗅探原播放页
    return JSON.stringify({ parse: 1, url: url, header: header });
}

function search(wd, quick, pg) {
    pg = parseInt(pg || 1);
    if (!pg || pg < 1) pg = 1;
    log("search wd=" + wd + " pg=" + pg);
    var url = HOST + "/search.php?searchword=" + encodeURIComponent(wd || "") + "&page=" + pg;
    var html = requestText(url);
    var list = parseList(html);
    return JSON.stringify({
        page: pg,
        pagecount: list.length > 0 ? pg + 1 : pg,
        limit: 20,
        total: 999999,
        list: list
    });
}

/* ---------------- base64 解码 (纯 JS, 无外部依赖) ---------------- */

var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64decode(b64) {
    var lookup = {};
    for (var i = 0; i < B64_CHARS.length; i++) lookup[B64_CHARS.charAt(i)] = i;
    b64 = toStr(b64).replace(/[^A-Za-z0-9+/]/g, "");
    var bytes = [];
    var buf = 0, bits = 0;
    for (var k = 0; k < b64.length; k++) {
        var c = lookup[b64.charAt(k)];
        if (c === undefined) continue;
        buf = (buf << 6) | c;
        bits += 6;
        if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xff); }
    }
    // UTF-8 字节 -> 字符串
    var out = "";
    var j = 0, len = bytes.length;
    while (j < len) {
        var b = bytes[j++] & 0xff;
        if (b < 0x80) {
            out += String.fromCharCode(b);
        } else if (b >= 0xc0 && b < 0xe0) {
            out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[j++] & 0x3f));
        } else if (b >= 0xe0 && b < 0xf0) {
            out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[j++] & 0x3f) << 6) | (bytes[j++] & 0x3f));
        } else {
            var cp = ((b & 0x07) << 18) | ((bytes[j++] & 0x3f) << 12) | ((bytes[j++] & 0x3f) << 6) | (bytes[j++] & 0x3f);
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
    }
    return out;
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
