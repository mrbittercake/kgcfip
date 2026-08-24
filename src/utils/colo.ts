// Cloudflare colo 代码到地区名称的映射表
// NOTE: 后端 functions/api/getips.ts 有一份同样的副本，修改时请同步更新
export const coloMap: { [key: string]: string } = {
    'SJC': '🇺🇸 圣何塞', 'LAX': '🇺🇸 洛杉矶', 'SEA': '🇺🇸 西雅图', 'SFO': '🇺🇸 旧金山', 'DFW': '🇺🇸 达拉斯',
    'ORD': '🇺🇸 芝加哥', 'IAD': '🇺🇸 华盛顿', 'ATL': '🇺🇸 亚特兰大', 'MIA': '🇺🇸 迈阿密', 'DEN': '🇺🇸 丹佛',
    'PHX': '🇺🇸 凤凰城', 'BOS': '🇺🇸 波士顿', 'EWR': '🇺🇸 纽瓦克', 'JFK': '🇺🇸 纽约', 'LAS': '🇺🇸 拉斯维加斯',
    'MSP': '🇺🇸 明尼阿波利斯', 'DTW': '🇺🇸 底特律', 'PHL': '🇺🇸 费城', 'CLT': '🇺🇸 夏洛特', 'SLC': '🇺🇸 盐湖城',
    'PDX': '🇺🇸 波特兰', 'SAN': '🇺🇸 圣地亚哥', 'TPA': '🇺🇸 坦帕', 'IAH': '🇺🇸 休斯顿', 'MCO': '🇺🇸 奥兰多',
    'AUS': '🇺🇸 奥斯汀', 'BNA': '🇺🇸 纳什维尔', 'RDU': '🇺🇸 罗利', 'IND': '🇺🇸 印第安纳波利斯', 'CMH': '🇺🇸 哥伦布',
    'MCI': '🇺🇸 堪萨斯城', 'OMA': '🇺🇸 奥马哈', 'ABQ': '🇺🇸 阿尔伯克基', 'OKC': '🇺🇸 俄克拉荷马城', 'MEM': '🇺🇸 孟菲斯',
    'JAX': '🇺🇸 杰克逊维尔', 'RIC': '🇺🇸 里士满', 'BUF': '🇺🇸 布法罗', 'PIT': '🇺🇸 匹兹堡', 'CLE': '🇺🇸 克利夫兰',
    'CVG': '🇺🇸 辛辛那提', 'MKE': '🇺🇸 密尔沃基', 'STL': '🇺🇸 圣路易斯', 'SAT': '🇺🇸 圣安东尼奥', 'HNL': '🇺🇸 檀香山',
    'ANC': '🇺🇸 安克雷奇', 'SMF': '🇺🇸 萨克拉门托', 'ONT': '🇺🇸 安大略', 'OAK': '🇺🇸 奥克兰',
    'HKG': '🇭🇰 香港', 'TPE': '🇨🇳 台北', 'TSA': '🇨🇳 台北松山', 'KHH': '🇨🇳 高雄',
    'NRT': '🇯🇵 东京成田', 'HND': '🇯🇵 东京羽田', 'KIX': '🇯🇵 大阪关西', 'ITM': '🇯🇵 大阪伊丹', 'NGO': '🇯🇵 名古屋',
    'FUK': '🇯🇵 福冈', 'CTS': '🇯🇵 札幌', 'OKA': '🇯🇵 冲绳',
    'ICN': '🇰🇷 首尔仁川', 'GMP': '🇰🇷 首尔金浦', 'PUS': '🇰🇷 釜山',
    'SIN': '🇸🇬 新加坡', 'BKK': '🇹🇭 曼谷', 'DMK': '🇹🇭 曼谷廊曼', 'KUL': '🇲🇾 吉隆坡', 'CGK': '🇮🇩 雅加达',
    'MNL': '🇵🇭 马尼拉', 'CEB': '🇵🇭 宿务', 'HAN': '🇻🇳 河内', 'SGN': '🇻🇳 胡志明', 'DAD': '🇻🇳 岘港',
    'RGN': '🇲🇲 仰光', 'PNH': '🇰🇭 金边', 'REP': '🇰🇭 暹粒', 'VTE': '🇱🇦 万象',
    'BOM': '🇮🇳 孟买', 'DEL': '🇮🇳 新德里', 'MAA': '🇮🇳 金奈', 'BLR': '🇮🇳 班加罗尔', 'CCU': '🇮🇳 加尔各答',
    'HYD': '🇮🇳 海得拉巴', 'AMD': '🇮🇳 艾哈迈达巴德', 'COK': '🇮🇳 科钦', 'PNQ': '🇮🇳 浦那', 'GOI': '🇮🇳 果阿',
    'CMB': '🇱🇰 科伦坡', 'DAC': '🇧🇩 达卡', 'KTM': '🇳🇵 加德满都', 'ISB': '🇵🇰 伊斯兰堡', 'KHI': '🇵🇰 卡拉奇', 'LHE': '🇵🇰 拉合尔',
    'LHR': '🇬🇧 伦敦希思罗', 'LGW': '🇬🇧 伦敦盖特威克', 'STN': '🇬🇧 伦敦斯坦斯特德', 'LTN': '🇬🇧 伦敦卢顿', 'MAN': '🇬🇧 曼彻斯特', 'EDI': '🇬🇧 爱丁堡', 'BHX': '🇬🇧 伯明翰',
    'CDG': '🇫🇷 巴黎戴高乐', 'ORY': '🇫🇷 巴黎奥利', 'MRS': '🇫🇷 马赛', 'LYS': '🇫🇷 里昂', 'NCE': '🇫🇷 尼斯',
    'FRA': '🇩🇪 法兰克福', 'MUC': '🇩🇪 慕尼黑', 'TXL': '🇩🇪 柏林', 'BER': '🇩🇪 柏林勃兰登堡', 'HAM': '🇩🇪 汉堡', 'DUS': '🇩🇪 杜塞尔多夫', 'CGN': '🇩🇪 科隆', 'STR': '🇩🇪 斯图加特',
    'AMS': '🇳🇱 阿姆斯特丹', 'BRU': '🇧🇪 布鲁塞尔', 'LUX': '🇱🇺 卢森堡',
    'ZRH': '🇨🇭 苏黎世', 'GVA': '🇨🇭 日内瓦', 'BSL': '🇨🇭 巴塞尔',
    'VIE': '🇦🇹 维也纳', 'PRG': '🇨🇿 布拉格', 'BUD': '🇭🇺 布达佩斯', 'WAW': '🇵🇱 华沙', 'KRK': '🇵🇱 克拉科夫',
    'MXP': '🇮🇹 米兰马尔彭萨', 'LIN': '🇮🇹 米兰利纳特', 'FCO': '🇮🇹 罗马', 'VCE': '🇮🇹 威尼斯', 'NAP': '🇮🇹 那不勒斯', 'FLR': '🇮🇹 佛罗伦萨', 'BGY': '🇮🇹 贝加莫',
    'MAD': '🇪🇸 马德里', 'BCN': '🇪🇸 巴塞罗那', 'PMI': '🇪🇸 帕尔马', 'AGP': '🇪🇸 马拉加', 'VLC': '🇪🇸 瓦伦西亚', 'SVQ': '🇪🇸 塞维利亚', 'BIO': '🇪🇸 毕尔巴鄂',
    'LIS': '🇵🇹 里斯本', 'OPO': '🇵🇹 波尔图', 'FAO': '🇵🇹 法鲁',
    'DUB': '🇮🇪 都柏林', 'CPH': '🇩🇰 哥本哈根', 'ARN': '🇸🇪 斯德哥尔摩', 'GOT': '🇸🇪 哥德堡',
    'OSL': '🇳🇴 奥斯陆', 'BGO': '🇳🇴 卑尔根', 'HEL': '🇫🇮 赫尔辛基', 'RIX': '🇱🇻 里加', 'TLL': '🇪🇪 塔林', 'VNO': '🇱🇹 维尔纽斯',
    'ATH': '🇬🇷 雅典', 'SKG': '🇬🇷 塞萨洛尼基', 'SOF': '🇧🇬 索非亚', 'OTP': '🇷🇴 布加勒斯特', 'BEG': '🇷🇸 贝尔格莱德', 'ZAG': '🇭🇷 萨格勒布', 'LJU': '🇸🇮 卢布尔雅那',
    'KBP': '🇺🇦 基辅', 'IEV': '🇺🇦 基辅茹良尼', 'ODS': '🇺🇦 敖德萨',
    'SVO': '🇷🇺 莫斯科谢列梅捷沃', 'DME': '🇷🇺 莫斯科多莫杰多沃', 'VKO': '🇷🇺 莫斯科伏努科沃', 'LED': '🇷🇺 圣彼得堡',
    'IST': '🇹🇷 伊斯坦布尔', 'SAW': '🇹🇷 伊斯坦布尔萨比哈', 'ESB': '🇹🇷 安卡拉', 'AYT': '🇹🇷 安塔利亚', 'ADB': '🇹🇷 伊兹密尔',
    'TLV': '🇮🇱 特拉维夫', 'AMM': '🇯🇴 安曼', 'BEY': '🇱🇧 贝鲁特', 'BAH': '🇧🇭 巴林', 'KWI': '🇰🇼 科威特',
    'DXB': '🇦🇪 迪拜', 'AUH': '🇦🇪 阿布扎比', 'SHJ': '🇦🇪 沙迦', 'DOH': '🇶🇦 多哈', 'MCT': '🇴🇲 马斯喀特',
    'RUH': '🇸🇦 利雅得', 'JED': '🇸🇦 吉达', 'DMM': '🇸🇦 达曼',
    'CAI': '🇪🇬 开罗', 'HBE': '🇪🇬 亚历山大', 'SSH': '🇪🇬 沙姆沙伊赫',
    'CMN': '🇲🇦 卡萨布兰卡', 'RAK': '🇲🇦 马拉喀什', 'TUN': '🇹🇳 突尼斯', 'ALG': '🇩🇿 阿尔及尔',
    'LOS': '🇳🇬 拉各斯', 'ABV': '🇳🇬 阿布贾', 'ACC': '🇬🇭 阿克拉', 'NBO': '🇰🇪 内罗毕', 'MBA': '🇰🇪 蒙巴萨', 'ADD': '🇪🇹 亚的斯亚贝巴', 'DAR': '🇹🇿 达累斯萨拉姆',
    'JNB': '🇿🇦 约翰内斯堡', 'CPT': '🇿🇦 开普敦', 'DUR': '🇿🇦 德班', 'HRE': '🇿🇼 哈拉雷', 'LUN': '🇿🇲 卢萨卡',
    'MRU': '🇲🇺 毛里求斯', 'SEZ': '🇸🇨 塞舌尔',
    'SYD': '🇦🇺 悉尼', 'MEL': '🇦🇺 墨尔本', 'BNE': '🇦🇺 布里斯班', 'PER': '🇦🇺 珀斯', 'ADL': '🇦🇺 阿德莱德', 'CBR': '🇦🇺 堪培拉', 'OOL': '🇦🇺 黄金海岸', 'CNS': '🇦🇺 凯恩斯',
    'AKL': '🇳🇿 奥克兰', 'WLG': '🇳🇿 惠灵顿', 'CHC': '🇳🇿 基督城', 'ZQN': '🇳🇿 皇后镇',
    'NAN': '🇫🇯 楠迪', 'PPT': '🇵🇫 帕皮提', 'GUM': '🇬🇺 关岛',
    'GRU': '🇧🇷 圣保罗', 'GIG': '🇧🇷 里约热内卢', 'BSB': '🇧🇷 巴西利亚', 'CNF': '🇧🇷 贝洛奥里藏特', 'POA': '🇧🇷 阿雷格里港', 'CWB': '🇧🇷 库里蒂巴', 'FOR': '🇧🇷 福塔莱萨', 'REC': '🇧🇷 累西腓', 'SSA': '🇧🇷 萨尔瓦多',
    'EZE': '🇦🇷 布宜诺斯艾利斯', 'COR': '🇦🇷 科尔多瓦', 'MDZ': '🇦🇷 门多萨',
    'SCL': '🇨🇱 圣地亚哥', 'LIM': '🇵🇪 利马', 'BOG': '🇨🇴 波哥大', 'MDE': '🇨🇴 麦德林',
    'UIO': '🇪🇨 基多', 'GYE': '🇪🇨 瓜亚基尔', 'CCS': '🇻🇪 加拉加斯', 'MVD': '🇺🇾 蒙得维的亚', 'ASU': '🇵🇾 亚松森',
    'PTY': '🇵🇦 巴拿马城', 'SJO': '🇨🇷 圣何塞', 'GUA': '🇬🇹 危地马拉城', 'SAL': '🇸🇻 圣萨尔瓦多',
    'MEX': '🇲🇽 墨西哥城', 'GDL': '🇲🇽 瓜达拉哈拉', 'MTY': '🇲🇽 蒙特雷', 'CUN': '🇲🇽 坎昆',
    'YYZ': '🇨🇦 多伦多', 'YVR': '🇨🇦 温哥华', 'YUL': '🇨🇦 蒙特利尔', 'YYC': '🇨🇦 卡尔加里', 'YEG': '🇨🇦 埃德蒙顿', 'YOW': '🇨🇦 渥太华',
};

/**
 * 将 colo 代码转换为用户友好的地区名称
 * @param colo 3个字母的 colo 代码 (例如 "SJC")
 * @returns 地区名称，如果未找到则返回原 colo 代码
 */
export const getColoName = (colo: string): string => {
    return coloMap[colo.toUpperCase()] || colo;
};

/**
 * Cloudflare colo 代码到国家/地区代码 (ISO 3166-1 alpha-2 小写) 的映射
 * 用于在 Windows 系统下拼接国旗图片 URL (/flags/<code>.png)
 */
export const coloCountryMap: { [key: string]: string } = {
    'SJC': 'us', 'LAX': 'us', 'SEA': 'us', 'SFO': 'us', 'DFW': 'us',
    'ORD': 'us', 'IAD': 'us', 'ATL': 'us', 'MIA': 'us', 'DEN': 'us',
    'PHX': 'us', 'BOS': 'us', 'EWR': 'us', 'JFK': 'us', 'LAS': 'us',
    'MSP': 'us', 'DTW': 'us', 'PHL': 'us', 'CLT': 'us', 'SLC': 'us',
    'PDX': 'us', 'SAN': 'us', 'TPA': 'us', 'IAH': 'us', 'MCO': 'us',
    'AUS': 'us', 'BNA': 'us', 'RDU': 'us', 'IND': 'us', 'CMH': 'us',
    'MCI': 'us', 'OMA': 'us', 'ABQ': 'us', 'OKC': 'us', 'MEM': 'us',
    'JAX': 'us', 'RIC': 'us', 'BUF': 'us', 'PIT': 'us', 'CLE': 'us',
    'CVG': 'us', 'MKE': 'us', 'STL': 'us', 'SAT': 'us', 'HNL': 'us',
    'ANC': 'us', 'SMF': 'us', 'ONT': 'ca', 'OAK': 'us',
    'HKG': 'hk', 'TPE': 'cn', 'TSA': 'cn', 'KHH': 'cn',
    'NRT': 'jp', 'HND': 'jp', 'KIX': 'jp', 'ITM': 'jp', 'NGO': 'jp',
    'FUK': 'jp', 'CTS': 'jp', 'OKA': 'jp',
    'ICN': 'kr', 'GMP': 'kr', 'PUS': 'kr',
    'SIN': 'sg', 'BKK': 'th', 'DMK': 'th', 'KUL': 'my', 'CGK': 'id',
    'MNL': 'ph', 'CEB': 'ph', 'HAN': 'vn', 'SGN': 'vn', 'DAD': 'vn',
    'RGN': 'mm', 'PNH': 'kh', 'REP': 'kh', 'VTE': 'la',
    'BOM': 'in', 'DEL': 'in', 'MAA': 'in', 'BLR': 'in', 'CCU': 'in',
    'HYD': 'in', 'AMD': 'in', 'COK': 'in', 'PNQ': 'in', 'GOI': 'in',
    'CMB': 'lk', 'DAC': 'bd', 'KTM': 'np', 'ISB': 'pk', 'KHI': 'pk', 'LHE': 'pk',
    'LHR': 'gb', 'LGW': 'gb', 'STN': 'gb', 'LTN': 'gb', 'MAN': 'gb', 'EDI': 'gb', 'BHX': 'gb',
    'CDG': 'fr', 'ORY': 'fr', 'MRS': 'fr', 'LYS': 'fr', 'NCE': 'fr',
    'FRA': 'de', 'MUC': 'de', 'TXL': 'de', 'BER': 'de', 'HAM': 'de', 'DUS': 'de', 'CGN': 'de', 'STR': 'de',
    'AMS': 'nl', 'BRU': 'be', 'LUX': 'lu',
    'ZRH': 'ch', 'GVA': 'ch', 'BSL': 'ch',
    'VIE': 'at', 'PRG': 'cz', 'BUD': 'hu', 'WAW': 'pl', 'KRK': 'pl',
    'MXP': 'it', 'LIN': 'it', 'FCO': 'it', 'VCE': 'it', 'NAP': 'it', 'FLR': 'it', 'BGY': 'it',
    'MAD': 'es', 'BCN': 'es', 'PMI': 'es', 'AGP': 'es', 'VLC': 'es', 'SVQ': 'es', 'BIO': 'es',
    'LIS': 'pt', 'OPO': 'pt', 'FAO': 'pt',
    'DUB': 'ie', 'CPH': 'dk', 'ARN': 'se', 'GOT': 'se',
    'OSL': 'no', 'BGO': 'no', 'HEL': 'fi', 'RIX': 'lv', 'TLL': 'ee', 'VNO': 'lt',
    'ATH': 'gr', 'SKG': 'gr', 'SOF': 'bg', 'OTP': 'ro', 'BEG': 'rs', 'ZAG': 'hr', 'LJU': 'si',
    'KBP': 'ua', 'IEV': 'ua', 'ODS': 'ua',
    'SVO': 'ru', 'DME': 'ru', 'VKO': 'ru', 'LED': 'ru',
    'IST': 'tr', 'SAW': 'tr', 'ESB': 'tr', 'AYT': 'tr', 'ADB': 'tr',
    'TLV': 'il', 'AMM': 'jo', 'BEY': 'lb', 'BAH': 'bh', 'KWI': 'kw',
    'DXB': 'ae', 'AUH': 'ae', 'SHJ': 'ae', 'DOH': 'qa', 'MCT': 'om',
    'RUH': 'sa', 'JED': 'sa', 'DMM': 'sa',
    'CAI': 'eg', 'HBE': 'eg', 'SSH': 'eg',
    'CMN': 'ma', 'RAK': 'ma', 'TUN': 'tn', 'ALG': 'dz',
    'LOS': 'ng', 'ABV': 'ng', 'ACC': 'gh', 'NBO': 'ke', 'MBA': 'ke', 'ADD': 'et', 'DAR': 'tz',
    'JNB': 'za', 'CPT': 'za', 'DUR': 'za', 'HRE': 'zw', 'LUN': 'zm',
    'MRU': 'mu', 'SEZ': 'sc',
    'SYD': 'au', 'MEL': 'au', 'BNE': 'au', 'PER': 'au', 'ADL': 'au', 'CBR': 'au', 'OOL': 'au', 'CNS': 'au',
    'AKL': 'nz', 'WLG': 'nz', 'CHC': 'nz', 'ZQN': 'nz',
    'NAN': 'fj', 'PPT': 'pf', 'GUM': 'gu',
    'GRU': 'br', 'GIG': 'br', 'BSB': 'br', 'CNF': 'br', 'POA': 'br', 'CWB': 'br', 'FOR': 'br', 'REC': 'br', 'SSA': 'br',
    'EZE': 'ar', 'COR': 'ar', 'MDZ': 'ar',
    'SCL': 'cl', 'LIM': 'pe', 'BOG': 'co', 'MDE': 'co',
    'UIO': 'ec', 'GYE': 'ec', 'CCS': 've', 'MVD': 'uy', 'ASU': 'py',
    'PTY': 'pa', 'SJO': 'cr', 'GUA': 'gt', 'SAL': 'sv',
    'MEX': 'mx', 'GDL': 'mx', 'MTY': 'mx', 'CUN': 'mx',
    'YYZ': 'ca', 'YVR': 'ca', 'YUL': 'ca', 'YYC': 'ca', 'YEG': 'ca', 'YOW': 'ca',
};

/**
 * 将 colo 代码转换为国家/地区代码 (ISO 3166-1 alpha-2 小写)
 */
export const getColoCountry = (colo: string): string | null => {
    return coloCountryMap[colo.toUpperCase()] || null;
};

/**
 * 获取指定 colo 对应的国旗图片 URL (本地静态资源)
 */
export const getFlagUrl = (colo: string): string | null => {
    const country = getColoCountry(colo);
    return country ? `/flags/${country}.png` : null;
};

/**
 * 剥离 getColoName 返回值开头的国旗 emoji (两个 Regional Indicator 字符)，
 * 用于 Windows 平台下与国旗图片配合显示的纯文本。
 */
const stripLeadingFlagEmoji = (s: string): string => {
    return s.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '');
};

/**
 * 将 colo 代码转换为纯文本地区名称 (不含 emoji)
 */
export const getColoText = (colo: string): string => {
    return stripLeadingFlagEmoji(getColoName(colo));
};

/**
 * 检测当前是否运行在 Windows 平台。
 * Windows 下的浏览器对国家旗 emoji 渲染为两个字母代码 (例如 "JP")，
 * 因此在 Windows 下需要用真实国旗图片来替代。
 */
export const isWindowsPlatform = (): boolean => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
    return /Windows/i.test(ua) || /Win/i.test(platform);
};
