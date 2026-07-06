import { Crypto, load, _ } from 'assets://js/lib/cat.js';

let HOST = 'https://www.4k-av.com';
let siteKey = '';
let siteType = 0;

const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': HOST + '/'
};

// ----- 画质映射表（标准目录名） -----
const QUALITY_MAP = {
    '4k': '4K',
    '2160p': '4K',
    '2k': '1080P',
    '1080p': '1080P',
    '1080': '1080P',
    '720p': '720P',
    '720': '720P'
};

// 将任意画质描述转换为标准目录名
function normalizeQuality(q) {
    const lower = q.toLowerCase().replace(/\s+/g, '');
    for (const [key, val] of Object.entries(QUALITY_MAP)) {
        if (lower.includes(key)) return val;
    }
    return '1080P'; // 默认
}

// ----- 基础网络请求 -----
async function request(url) {
    try {
        const res = await req(url, {
            method: 'get',
            headers: COMMON_HEADERS,
            timeout: 5000
        });
        return res.content;
    } catch (e) {
        return '';
    }
}

// ----- 初始化 -----
function init(cfg) {
    siteKey = cfg.skey;
    siteType = cfg.stype;
    if (cfg.ext) {
        HOST = cfg.ext.replace(/\/$/, '');
    }
}

// ----- 首页分类 -----
async function home(filter) {
    const classes = [
        { type_id: 'tv', type_name: '电视剧' },
        { type_id: 'movie', type_name: '电影' }
    ];
    
    // 提取的筛选配置
    const filterConfig = [
        {
            key: "year",
            name: "年份",
            value: [
                { n: "全部", v: "" },
                { n: "2026", v: "2026" },
                { n: "2025", v: "2025" },
                { n: "2024", v: "2024" },
                { n: "2023", v: "2023" },
                { n: "2022", v: "2022" },
                { n: "2021", v: "2021" },
                { n: "2020", v: "2020" },
                { n: "2019", v: "2019" }
            ]
        },
        {
            key: "tag",
            name: "标签",
            value: [
                { n: "全部", v: "" },
                { n: "动作", v: "tag/动作" },
                { n: "剧情", v: "tag/剧情" },
                { n: "冒险", v: "tag/冒险" },
                { n: "喜剧", v: "tag/喜剧" },
                { n: "国产剧", v: "tag/国产剧" },
                { n: "恐怖", v: "tag/恐怖" },
                { n: "战争", v: "tag/战争" },
                { n: "科幻", v: "tag/科幻" },
                { n: "动画", v: "tag/动画" },
                { n: "韩剧", v: "tag/韩剧" },
                { n: "犯罪", v: "tag/犯罪" },
                { n: "纪录片", v: "tag/纪录片" }
            ]
        }
    ];

    const filters = {
        "tv": filterConfig,
        "movie": filterConfig
    };

    return JSON.stringify({ class: classes, filters: filters });
}

// ----- 通用列表解析（首页、分类、搜索） -----
function parseVodList(html) {
    const $ = load(html);
    const list = [];
    $('.NTMitem, .RTMitem').each((_, el) => {
        const item = $(el);
        const a = item.find('.title a');
        const href = a.attr('href');
        const name = a.text().trim() || a.attr('title');
        const poster = item.find('.poster img');
        let pic = poster.attr('src') || poster.attr('data-original');
        if (pic && pic.startsWith('/')) pic = HOST + pic;
        let remarks = item.find('.resyear label[title="分辨率"]').text().trim();
        if (!remarks) remarks = item.find('.poster span').text().trim();
        if (href && name) {
            list.push({
                vod_id: href,
                vod_name: name,
                vod_pic: pic,
                vod_remarks: remarks
            });
        }
    });
    return list;
}

// ----- 首页推荐 -----
async function homeVod() {
    const html = await request(HOST + '/');
    const list = parseVodList(html);
    return JSON.stringify({ list });
}

// ----- 分类页 -----
async function category(tid, pg, filter, extend) {
    let id = tid;
    // 适配筛选参数，覆盖原本的栏目 id
    if (extend && extend.year) {
        id = extend.year;
    } else if (extend && extend.tag) {
        id = extend.tag;
    }

    let url = pg > 1 ? `${HOST}/${id}/page-${pg}.html` : `${HOST}/${id}/`;
    const html = await request(url);
    const list = parseVodList(html);
    return JSON.stringify({
        page: parseInt(pg),
        pagecount: list.length === 0 ? parseInt(pg) : parseInt(pg) + 1,
        limit: 20,
        total: list.length === 0 ? parseInt(pg) * 20 : (parseInt(pg) + 1) * 20,
        list
    });
}

// ----- 详情页（支持多画质线路） -----
async function detail(id) {
    let url = id.startsWith('http') ? id : HOST + id;
    const html = await request(url);
    const $ = load(html);

    // 1. 提取分辨率列表
    let resList = [];
    $('#MainContent_videodetail label').each((_, el) => {
        const text = $(el).text();
        if (text.includes('分辨率')) {
            const raw = text.replace('分辨率:', '').trim();
            resList = raw.split('/').map(s => s.trim()).filter(Boolean);
        }
    });
    if (resList.length === 0) resList = ['1080P']; // 兜底

    // 2. 提取标签与演员
    const tags = [];
    $('#MainContent_tags a').each((_, el) => tags.push($(el).text().trim()));
    let actor = '';
    const subtitle = $('#MainContent_titleh12 h2').text().trim();
    if (subtitle) {
        const parts = subtitle.split('/');
        if (parts.length > 1) actor = parts.slice(1).join('/').trim();
    }

    // 3. 构建基础剧集列表
    const epList = [];
    $('#rtlist li').each((_, el) => {
        const item = $(el);
        const a = item.find('a');
        if (a.length) {
            const epUrl = a.attr('href');
            const epName = a.find('span').text().trim() || a.attr('title') || '播放';
            epList.push({ name: epName, url: epUrl });
        } else {
            // 当前播放集（无链接）
            const epName = item.find('span.stitle').text().trim() || '正片';
            epList.push({ name: epName, url: id }); // 使用当前详情页ID
        }
    });
    if (epList.length === 0) epList.push({ name: '正片', url: id });

    // 4. 为每个画质生成线路
    const playFroms = [];
    const playUrls = [];
    resList.forEach(res => {
        const dirName = normalizeQuality(res); // 标准化目录名
        const lineName = `4KAV-${res}`;
        playFroms.push(lineName);
        // 每个剧集附加画质目录
        const lineEpStr = epList.map(ep => `${ep.name}$${ep.url}|${dirName}`).join('#');
        playUrls.push(lineEpStr);
    });

    // 5. 组装vod信息
    const vod = {
        vod_id: id,
        vod_name: $('#tophead h1').text().trim() || $('.videodetail').attr('title'),
        vod_pic: $('#MainContent_poster img').attr('src'),
        type_name: tags.join(','),
        vod_year: $('#MainContent_videodetail a').text().trim(),
        vod_area: '',
        vod_remarks: resList.join('/'),
        vod_actor: actor,
        vod_director: '',
        vod_content: $('#MainContent_videodesc p').map((i, el) => $(el).text().trim()).get().join('\n'),
        vod_play_from: playFroms.join('$$$'),
        vod_play_url: playUrls.join('$$$')
    };
    if (vod.vod_pic && vod.vod_pic.startsWith('/')) vod.vod_pic = HOST + vod.vod_pic;

    return JSON.stringify({ list: [vod] });
}

// ----- 搜索 -----
async function search(wd, quick, pg) {
    const url = `${HOST}/s?d=${encodeURIComponent(wd)}`;
    const html = await request(url);
    const list = parseVodList(html);
    return JSON.stringify({ list });
}

// ----- 播放（支持画质切换） -----
async function play(flag, id, flags) {
    // id 格式: realPageUrl|targetDir
    const parts = id.split('|');
    const realId = parts[0];
    const targetDir = parts[1] || '1080P'; // 默认1080P

    const url = realId.startsWith('http') ? realId : HOST + realId;
    const html = await request(url);
    if (!html) {
        return JSON.stringify({ parse: 0, url: '', header: {} });
    }

    const $ = load(html);
    let playUrl = '';

    // 方式1：从 video source 提取
    const sources = $('video source');
    if (sources.length) {
        // 优先选择与目标画质匹配的 source（若有多个）
        for (let i = 0; i < sources.length; i++) {
            const src = sources.eq(i).attr('src');
            if (src) {
                // 如果当前source的路径包含目标画质目录，直接使用
                if (src.includes(`/${targetDir}/`)) {
                    playUrl = src;
                    break;
                }
                // 否则记录第一个作为备选
                if (!playUrl) playUrl = src;
            }
        }
    }

    // 方式2：正则匹配（如果未找到）
    if (!playUrl) {
        const match = html.match(/(https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4)[^\s"'<>]*)/);
        if (match) playUrl = match[1];
    }

    // 如果依旧没有，返回空
    if (!playUrl) {
        return JSON.stringify({ parse: 0, url: '', header: {} });
    }

    // 替换画质目录（如果目标目录与当前不同）
    if (targetDir && !playUrl.includes(`/${targetDir}/`)) {
        // 匹配常见画质目录（忽略大小写）
        const dirPattern = /\/(4K|1080P|720P|1080|720|2160P|2K)\//i;
        if (dirPattern.test(playUrl)) {
            playUrl = playUrl.replace(dirPattern, `/${targetDir}/`);
        } else {
            // 如果无法匹配，尝试在文件名前插入目录（较少见，但作为备选）
            // 例如: /tv/xxx/xxx.m3u8 -> /tv/xxx/1080P/xxx.m3u8
            const lastSlash = playUrl.lastIndexOf('/');
            if (lastSlash !== -1) {
                const base = playUrl.substring(0, lastSlash);
                const file = playUrl.substring(lastSlash + 1);
                playUrl = `${base}/${targetDir}/${file}`;
            }
        }
    }

    return JSON.stringify({
        parse: 0,
        url: playUrl,
        header: {
            'User-Agent': COMMON_HEADERS['User-Agent'],
            'Referer': HOST + '/'
        }
    });
}

// ----- 导出接口 -----
export function __jsEvalReturn() {
    return {
        init,
        home,
        homeVod,
        category,
        detail,
        search,
        play
    };
}