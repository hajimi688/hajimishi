/*
 * @File   : ddys.js
 * @Author : opencode
 * @Date   : 2026-07-09
 * @Desc   : 低端影视 (ddys.io) TVBox T4(JS) 源 —— 自包含，无外部依赖
 *
 * 站点特征：
 *  - 非标 SSR 自定义模板，数据在服务端渲染 HTML 里（含 JSON-LD 结构化数据）。
 *  - 无防护盾、无加密，普通 GET 即可拉取。
 *  - 列表：{basePath} 第1页，{basePath}/page/{n} 第n页。
 *      basePath 规律（筛选项是路径段，单选切换，会整体替换 basePath）：
 *        分类首页      : /movie /series /variety /anime
 *        排序(豆瓣评分): /rating/{type}      排序(近期热门): /popular/{type}
 *        题材         : /{type}/genre/{slug}
 *        地区         : /{type}/region/{slug}
 *        年份         : /{type}/year/{n}
 *  - 详情：/movie/{slug}
 *      标题/导演/主演/年份/类型/评分 在 <script type="application/ld+json"> 里。
 *      在线播放源：页面里 switchSource(id, episodes, kind) 函数，
 *          episodes 用 # 分隔多集，每集 形如  集名$直链(m3u8/mp4)。
 *      多个播放源是多个 switchSource button，按 DOM 顺序。
 *  - 播放：episodes 字符串里 $ 后面的就是直链，parse=0 直接返回。
 *  - 搜索：POST 表单提交 /search，但站点同时提供 GET JSON 接口
 *      /api/search-suggest?q={关键词} 返回 {success,data:[{title,slug,year,rating,type,type_code,url}]}
 *      本源用该接口实现搜索，足够覆盖影片检索。
 *
 * 分类设计：
 *  一级分类 = 影片类型(movie/series/variety/anime)；
 *  每个分类下提供 排序/题材/地区/年份 四个筛选维度。
 *  type_id 编码为 "{type}|{sort}|{genre}|{region}|{year}"，category 解析后拼 basePath。
 */

var DD_VERSION = "20260709-js-1";
var HOST = "https://ddys.io";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 备用域名（init 时若主站不通可由配置覆盖）
var ALT_HOSTS = [
    "https://ddys.io",
    "https://ddys.forum",
    "https://ddys.autos",
    "https://ddys.quest"
];

// 一级分类
var CLASSES = [
    { type_id: "movie",  type_name: "电影" },
    { type_id: "series", type_name: "剧集" },
    { type_id: "variety",type_name: "综艺" },
    { type_id: "anime",  type_name: "动漫" }
];

// 筛选项（题材/地区/年份/排序）—— 与站点 filterUrls 完全一致
var SORT_OPTS = [
    { n: "最新更新", v: "" },
    { n: "豆瓣评分", v: "rating" },
    { n: "近期热门", v: "popular" }
];

var GENRE_OPTS = [
    { n: "全部", v: "" }, { n: "动作", v: "action" }, { n: "喜剧", v: "comedy" },
    { n: "爱情", v: "romance" }, { n: "科幻", v: "scifi" }, { n: "悬疑", v: "thriller" },
    { n: "剧情", v: "drama" }, { n: "恐怖", v: "horror" }, { n: "惊悚", v: "suspense" },
    { n: "冒险", v: "adventure" }, { n: "战争", v: "war" }, { n: "历史", v: "history" },
    { n: "传记", v: "biography" }, { n: "犯罪", v: "crime" }, { n: "西部", v: "western" },
    { n: "奇幻", v: "fantasy" }, { n: "音乐", v: "music" }, { n: "歌舞", v: "musical" },
    { n: "家庭", v: "family" }, { n: "运动", v: "sport" }, { n: "古装", v: "costume" },
    { n: "武侠", v: "martial" }, { n: "都市", v: "urban" }, { n: "灾难", v: "disaster" },
    { n: "纪录片", v: "documentary" }, { n: "动画", v: "animation" }, { n: "短片", v: "short" },
    { n: "真人秀", v: "realityshow" }, { n: "脱口秀", v: "talkshow" }, { n: "黑色幽默", v: "darkcomedy" },
    { n: "末日", v: "apocalypse" }, { n: "谍战", v: "espionage" }, { n: "职场", v: "workplace" },
    { n: "校园", v: "campus" }, { n: "推理", v: "mystery" }, { n: "情色", v: "erotic" },
    { n: "其他", v: "other" }
];

var REGION_OPTS = [
    { n: "全部", v: "" }, { n: "中国", v: "china" }, { n: "美国", v: "usa" },
    { n: "日本", v: "japan" }, { n: "韩国", v: "korea" }, { n: "英国", v: "uk" },
    { n: "法国", v: "france" }, { n: "德国", v: "germany" }, { n: "印度", v: "india" },
    { n: "意大利", v: "italy" }, { n: "西班牙", v: "spain" }, { n: "加拿大", v: "canada" },
    { n: "澳大利亚", v: "australia" }, { n: "俄罗斯", v: "russia" }, { n: "泰国", v: "thailand" },
    { n: "中国香港", v: "hongkong" }, { n: "中国台湾", v: "taiwan" }, { n: "中国澳门", v: "macau" },
    { n: "巴西", v: "brazil" }, { n: "墨西哥", v: "mexico" }, { n: "土耳其", v: "turkey" },
    { n: "瑞典", v: "sweden" }, { n: "丹麦", v: "denmark" }, { n: "挪威", v: "norway" },
    { n: "荷兰", v: "netherlands" }, { n: "伊朗", v: "iran" }, { n: "波兰", v: "poland" },
    { n: "新加坡", v: "singapore" }, { n: "马来西亚", v: "malaysia" }, { n: "越南", v: "vietnam" },
    { n: "菲律宾", v: "philippines" }, { n: "印度尼西亚", v: "indonesia" }, { n: "阿根廷", v: "argentina" },
    { n: "南非", v: "southafrica" }, { n: "其他", v: "other" }
];

var YEAR_OPTS = [
    { n: "全部", v: "" }, { n: "2027", v: "2027" }, { n: "2026", v: "2026" },
    { n: "2025", v: "2025" }, { n: "2024", v: "2024" }, { n: "2023", v: "2023" },
    { n: "2022", v: "2022" }, { n: "2021", v: "2021" }, { n: "2020", v: "2020" },
    { n: "2019", v: "2019" }, { n: "2018", v: "2018" }
];

// 构造每个分类的 filters（TVBox 形态：[{key,name,value:[{n,v}]}]）
function buildFilters() {
    var f = [
        { key: "sort",   name: "排序", value: SORT_OPTS },
        { key: "genre",  name: "题材", value: GENRE_OPTS },
        { key: "region", name: "地区", value: REGION_OPTS },
        { key: "year",   name: "年份", value: YEAR_OPTS }
    ];
    var filters = {};
    for (var i = 0; i < CLASSES.length; i++) {
        filters[CLASSES[i].type_id] = f;
    }
    return filters;
}
var FILTERS = buildFilters();

function log(msg) {
    try { console.log("[DDYS_JS " + DD_VERSION + "] " + msg); } catch (e) {}
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

function isPlayableUrl(u) {
    return /^https?:\/\//i.test(toStr(u)) &&
        /\.(m3u8|mp4|flv|ts|mkv)(\?|$)/i.test(toStr(u));
}

function textClean(s) {
    return toStr(s)
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&/g, "&")
        .replace(/"/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/&#\d+;/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// 标准请求（GET 文本）
function request(url, headers) {
    headers = headers || {};
    if (!headers["User-Agent"]) headers["User-Agent"] = UA;
    if (!headers["Accept"]) headers["Accept"] = "text/html,application/xhtml+xml,*/*;q=0.8";
    if (!headers["Referer"]) headers["Referer"] = HOST + "/";
    try {
        log("fetch " + url);
        var res = req(url, { method: "GET", headers: headers, timeout: 15000 });
        var body = (typeof res === "string") ? res : (res && (res.content || res.body || res.data));
        return toStr(body || "");
    } catch (e) {
        log("fetch_error " + url + " " + e);
        return "";
    }
}

// JSON 请求
function requestJson(url) {
    var headers = {
        "User-Agent": UA,
        "Accept": "application/json,*/*;q=0.8",
        "Referer": HOST + "/"
    };
    try {
        var res = req(url, { method: "GET", headers: headers, timeout: 10000 });
        var body = (typeof res === "string") ? res : (res && (res.content || res.body || res.data));
        if (typeof body === "string") {
            try { return JSON.parse(body); } catch (e) { log("json_parse_error " + e); return null; }
        }
        return body || null;
    } catch (e) {
        log("json_fetch_error " + url + " " + e);
        return null;
    }
}

/* ---------------- 列表解析 ---------------- */

// 解析列表页 HTML -> [{vod_id,vod_name,vod_pic,vod_remarks}]
function parseList(html) {
    var list = [];
    if (!html) return list;
    // 卡片锚点：<a href="/movie/{slug}" ...> ... <img alt="片名" src="..."> ... </a>
    // 用非贪婪正则切出每个 <a ... class="...movie-card...">块
    var reCard = /<a[^>]*\shref="\/(movie|series|variety|anime)\/[^"]+"[^>]*>/g;
    var cards = [];
    var m;
    while ((m = reCard.exec(html)) !== null) {
        var start = m.index;
        var end = html.indexOf("</a>", start);
        if (end < 0) end = start + m[0].length;
        cards.push(html.substring(start, end + 4));
    }
    for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        // href：/movie/slug
        var href = /(\/(?:movie|series|variety|anime)\/[^"\/?#]+)/.exec(c);
        if (!href) continue;
        var path = href[1];
        // 取最后一个路径段作 vod_id（拼全路径作 vod_id 即可，detail 能识别）
        // 图片：取 <img ... src="..."> 第一个 src
        var pic = "";
        var pm = /<img[^>]*\ssrc="([^"]+)"/i.exec(c);
        if (pm) pic = pm[1];
        // 片名：优先 img alt，其次 h3 文本
        var name = "";
        var am = /<img[^>]*\salt="([^"]+)"/i.exec(c);
        if (am) name = textClean(am[1]);
        var hm = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(c);
        if (!name && hm) name = textClean(hm[1]);
        if (!name) {
            // 从 href 最后一段兜底
            var segs = path.split("/");
            name = segs[segs.length - 1];
        }
        if (!name) continue;
        // 备注：评分 / 状态（新片/热门/已完结/更新中）
        var remark = "";
        var rm = /<span[^>]*class="[^"]*rating[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(c);
        if (rm) remark = textClean(rm[1]);
        list.push({
            vod_id: path,
            vod_name: name,
            vod_pic: fixUrl(pic),
            vod_remarks: remark
        });
    }
    // 去重（按 vod_id）
    var seen = {};
    var out = [];
    for (var j = 0; j < list.length; j++) {
        if (!seen[list[j].vod_id]) {
            seen[list[j].vod_id] = 1;
            out.push(list[j]);
        }
    }
    return out;
}

// 从分页 HTML 提取总页数
function parsePageCount(html, pg) {
    // 优先找 pagination-last 链接里的最大页码
    var maxPage = pg || 1;
    var re = /\/(?:page\/)(\d+)/g;
    var m;
    while ((m = re.exec(html)) !== null) {
        var n = parseInt(m[1]) || 0;
        if (n > maxPage) maxPage = n;
    }
    return maxPage;
}

/* ---------------- 播放源解析 ---------------- */

// 从详情页 HTML 提取所有播放源 -> [{flag, episodes:[{name,url}]}]
// 站点结构：多个 <button onclick="switchSource(id, 'episodes-string', 'kind')">
//   episodes-string 形如 "第01集$https://xxx/index.m3u8#第02集$https://yyy/index.m3u8"
//   电影单集则直接是 "https://xxx/index.m3u8"（无 # 且无 $）
function parsePlaySources(html) {
    var sources = [];
    if (!html) return sources;
    // 匹配 switchSource(...) 调用，第2个参数是引号包裹的字符串
    var re = /switchSource\(\s*\d+\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
    var m, idx = 0;
    while ((m = re.exec(html)) !== null) {
        var epsStr = m[1];
        var kind = m[2] || "m3u8";
        if (!epsStr) continue;

        // 取该源 tab 文本作 flag：找 source-tab-{id}
        // 这里简化用 "播放源N (清晰度)"
        idx++;
        var flag = "播放源" + idx;

        // 解析 episodes
        var eps = [];
        var parts = epsStr.split("#");
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (!p) continue;
            var name, url;
            var dollar = p.indexOf("$");
            if (dollar >= 0) {
                name = textClean(p.substring(0, dollar));
                url = p.substring(dollar + 1).trim();
            } else {
                // 无 $：要么是单集直链，要么是单集标题(无url)
                if (isPlayableUrl(p)) {
                    name = "播放";
                    url = p;
                } else {
                    name = textClean(p);
                    url = "";
                }
            }
            if (name && url && isPlayableUrl(url)) {
                eps.push({ name: name, url: url });
            }
        }

        if (eps.length > 0) {
            sources.push({ flag: flag, kind: kind, episodes: eps });
        }
    }
    return sources;
}

/* ---------------- 详情信息解析（JSON-LD） ---------------- */

// 从详情页提取 JSON-LD 对象
function parseLdJson(html) {
    if (!html) return null;
    var re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i;
    var m = re.exec(html);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { log("ldjson_parse_error " + e); return null; }
}

// 从详情页提取 meta 信息（标题外文名、年代、地区、类型、评分、导演、主演）
function parseDetailMeta(html) {
    var meta = {
        title: "", enTitle: "", year: "", country: "", genres: [],
        rating: "", director: "", actor: "", description: ""
    };
    var ld = parseLdJson(html);
    if (ld) {
        meta.title = toStr(ld.name || "");
        meta.enTitle = toStr(ld.alternateName || "");
        meta.year = toStr(ld.datePublished || "");
        if (ld.genre && ld.genre.length) {
            if (typeof ld.genre === "string") meta.genres = [ld.genre];
            else meta.genres = ld.genre.slice();
        }
        if (ld.aggregateRating && ld.aggregateRating.ratingValue) {
            meta.rating = "豆瓣(" + toStr(ld.aggregateRating.ratingValue) + ")";
        }
        if (ld.director && ld.director.length) {
            var dirs = [];
            for (var i = 0; i < ld.director.length; i++) dirs.push(toStr(ld.director[i].name));
            meta.director = dirs.join(" / ");
        }
        if (ld.actor && ld.actor.length) {
            var acts = [];
            for (var j = 0; j < ld.actor.length; j++) acts.push(toStr(ld.actor[j].name));
            meta.actor = acts.join(" / ");
        }
        meta.description = toStr(ld.description || "");
    }
    // 兜底：从 DOM 文本补地区年份等（meta 行 "2026 · 韩国 · 剧情 / 惊悚 / 犯罪"）
    if (!meta.country || meta.genres.length === 0) {
        var mm = /<div[^>]*>\s*(\d{4})\s*·\s*([^·<]+?)\s*·\s*([^<]+?)\s*<\/div>/i.exec(html);
        if (mm) {
            if (!meta.year) meta.year = textClean(mm[1]);
            if (!meta.country) meta.country = textClean(mm[2]);
            if (meta.genres.length === 0) {
                meta.genres = mm[3].split("/").map(function (g) { return textClean(g); }).filter(Boolean);
            }
        }
    }
    return meta;
}

/* ---------------- basePath 构造 ---------------- */

// 由 type+筛选 extend 构造分类基础路径（不含分页）
// 规律：sort/genre/region/year 是路径段，且站点是单选切换
//   推导叠加顺序（实测站点筛选会重定向，单选切换时 basePath 被替换，
//   但实际 URL 支持 basePath 段叠加：可以拼接 /{type}[/genre/x][/region/y][/year/z]
//   排序则前缀 /rating 或 /popular）
//   经验证站点实际行为：每选一项会跳转到对应单段路径，
//   但叠加多段路径（如 /movie/genre/action/region/china）服务端也接受并按全部筛选过滤。
function buildBasePath(type, extend) {
    extend = extend || {};
    type = toStr(type || "movie");
    var sort = toStr(extend.sort || "");
    var genre = toStr(extend.genre || "");
    var region = toStr(extend.region || "");
    var year = toStr(extend.year || "");

    // 排序影响 basePath 前缀
    var prefix = "/" + type;            // 默认最新更新
    if (sort === "rating") prefix = "/rating/" + type;
    else if (sort === "popular") prefix = "/popular/" + type;

    // 叠加题材/地区/年份（在 type 段后）。注意：rating/popular 排序下
    // 站点原始 filterUrls 不支持叠加 genre/region/year（只有最新更新才支持），
    // 故仅在 sort==="" 时叠加，其余情况忽略，避免拼出站点不识别的 URL。
    if (sort === "") {
        if (genre)  prefix += "/genre/" + genre;
        if (region) prefix += "/region/" + region;
        if (year)   prefix += "/year/" + year;
    }
    return prefix;
}

/* ---------------- 接口实现 ---------------- */

function init(ext) {
    // ext 可传入自定义主站，例如备用域名 ddys.autos
    if (typeof ext === "string" && /^https?:\/\//i.test(ext.trim())) {
        HOST = ext.trim().replace(/\/+$/, "");
        log("init override host=" + HOST);
    } else {
        // 默认主站，若需要可在此尝试 ALT_HOSTS 选最快的（这里保持简单）
        HOST = ALT_HOSTS[0];
    }
    log("init host=" + HOST);
}

function home(filter) {
    log("home");
    return JSON.stringify({ class: CLASSES, filters: FILTERS });
}

function homeVod() {
    log("homeVod");
    var html = request(HOST + "/");
    var list = parseList(html);
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    tid = toStr(tid || "movie");
    pg = parseInt(pg || 1);
    if (!pg || pg < 1) pg = 1;
    extend = extend || {};

    var base = buildBasePath(tid, extend);
    var url = HOST + base;
    if (pg > 1) url += "/page/" + pg;

    var html = request(url);
    var list = parseList(html);
    var pagecount = parsePageCount(html, pg);

    log("category base=" + base + " pg=" + pg + " count=" + list.length + " pages=" + pagecount);
    return JSON.stringify({
        page: pg,
        pagecount: pagecount,
        limit: list.length || 24,
        total: pagecount * (list.length || 24),
        list: list
    });
}

function detail(id) {
    var path = toStr(id);
    // vod_id 可能是 "/movie/slug" 或 "slug" 或 "slug|其它"
    var bar = path.indexOf("|");
    if (bar >= 0) path = path.substring(0, bar);
    if (path.charAt(0) !== "/") path = "/" + path;
    // 站点详情统一走 /movie/{slug}（series/variety/anime 的 slug 也在 /movie 下）
    if (!/^\/(movie|series|variety|anime)\//.test(path)) path = "/movie" + path;

    var url = HOST + path;
    var html = request(url);
    log("detail path=" + path + " ok=" + (html.length > 0));

    var meta = parseDetailMeta(html) || {};
    var sources = parsePlaySources(html);

    var vod = {
        vod_id: path,
        vod_name: meta.title || path.substring(path.lastIndexOf("/") + 1),
        vod_pic: "",
        vod_remarks: meta.rating || "",
        type_name: meta.genres.join(" / "),
        vod_year: meta.year,
        vod_area: meta.country,
        vod_director: meta.director,
        vod_actor: meta.actor,
        vod_content: meta.description
    };

    // 封面：og:image 或 ld+json image
    var ogm = /<meta\s+property="og:image"\s+content="([^"]+)"/i.exec(html);
    if (ogm) vod.vod_pic = fixUrl(ogm[1]);
    if (!vod.vod_pic && meta.image) vod.vod_pic = fixUrl(meta.image);

    if (sources.length > 0) {
        var playFrom = [];
        var playUrl = [];
        for (var i = 0; i < sources.length; i++) {
            var s = sources[i];
            playFrom.push(s.flag);
            var eps = [];
            for (var j = 0; j < s.episodes.length; j++) {
                eps.push(s.episodes[j].name + "$" + s.episodes[j].url);
            }
            playUrl.push(eps.join("#"));
        }
        vod.vod_play_from = playFrom.join("$$$");
        vod.vod_play_url = playUrl.join("$$$");
    } else {
        vod.vod_play_from = "提示";
        vod.vod_play_url = "暂无在线播放源$";
    }

    return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
    var url = toStr(id);
    var bar = url.indexOf("|");
    if (bar >= 0) url = url.substring(bar + 1);
    log("play flag=" + flag + " url=" + url.slice(0, 80));

    if (isPlayableUrl(url)) {
        // 直链是 m3u8/mp4，TVBox 内核直接嗅探/解析
        // 带 Referer 为本站以避免部分 CDN 防盗链
        var header = { "User-Agent": UA, "Referer": HOST + "/" };
        return JSON.stringify({ parse: 0, url: url, header: header });
    }
    // 非直链：交给内核尝试嗅探当前详情页（极少数情况）
    return JSON.stringify({ parse: 1, url: fixUrl(url) });
}

function search(wd, quick, pg) {
    pg = parseInt(pg || 1);
    if (!pg || pg < 1) pg = 1;
    wd = toStr(wd).trim();
    log("search wd=" + wd + " pg=" + pg);
    if (!wd) return JSON.stringify({ list: [], page: pg, pagecount: pg });

    // 用 GET JSON 建议接口（站点 POST /search 不便用）
    var url = HOST + "/api/search-suggest?q=" + encode(wd);
    var data = requestJson(url);
    var items = (data && data.success && data.data) ? data.data : [];

    var list = [];
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || !it.url) continue;
        var remark = "";
        if (it.rating && it.rating !== "0.0") remark = "豆瓣" + it.rating;
        if (it.year) remark = remark ? (remark + " · " + it.year) : it.year;
        if (it.type) remark = remark ? (remark + " · " + it.type) : it.type;
        list.push({
            vod_id: toStr(it.url),                 // 如 "/movie/grand-blue"
            vod_name: toStr(it.title),
            vod_pic: it.slug ? (HOST + "/movies/" + it.slug + ".webp") : "", // 推测封面，失败则空
            vod_remarks: remark
        });
    }

    // 该接口无分页，一次性返回，page=1 pagecount=1
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
