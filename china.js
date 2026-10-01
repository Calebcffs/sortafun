// china.js - the Chinese switch. A small button in the top bar (next to the
// speaker) turns the whole site Chinese: 有点烦 (yǒu diǎn fán, "a bit annoying",
// the sortafun joke) in red and gold, an 8-bit Chinese tune (sfx.js), every
// scoreboard says social credits (社会信用), and the guy puts on a robe and a hat.
//
// How it works:
//   - the choice is remembered in localStorage "sortafun-zh", and <html class="zh">
//     is set right away (this file loads in <head>) so there is no English flash
//   - ALL the look (colours, lanterns, outfit) is CSS under html.zh
//   - text is translated by EXACT whole-line match against the dictionary D below,
//     never by pieces, so a stray word in a game (a found word, the typing test)
//     can never be rewritten. Anything not in D stays English. The original text
//     is kept on every node, so switching back restores it exactly.
//   - word-game play areas are never touched (SKIP below, plus data-noxlate)
//
// To translate a new line: add  "the english line, lowercase": "中文",  to D.
// No em/en dashes or ellipsis characters anywhere (repo rule): use , . ! ? and
// the full-width 。，！？ in Chinese lines.

(function () {
  "use strict";
  if (window.SortafunZH) return;

  var KEY = "sortafun-zh";
  var root = document.documentElement;
  function read() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  var on = read();
  if (on) root.classList.add("zh");

  // ---------------------------------------------------------------
  // the dictionary: lowercase english line -> chinese
  // ---------------------------------------------------------------
  var D = Object.create(null);
  function add(o) { for (var k in o) D[k] = o[k]; }

  // site chrome
  add({
    "sortafun": "有点烦", "sortafun.org": "有点烦.org", "(alpha)": "(测试版)",
    "games": "游戏", "art": "艺术", "hangout": "聊天室", "home": "首页",
    "feedback": "意见反馈", "rate": "评分", "rate this game": "给游戏评分", "bugs, ideas, stars": "错误、想法、星星",
    "we're in alpha. tell us stuff": "测试版，说说你的想法", "tell us stuff": "说说你的想法",
    "sortafun is in alpha. what's broken, what's good, what's missing?": "有点烦还在测试中。什么坏了，什么好玩，缺什么？",
    "about": "关于", "the whole site": "整个网站", "stars": "星星", "this is...": "这是...", "general": "一般", "a bug": "一个错误", "a change": "一个改动",
    "tell us": "告诉我们", "your name": "你的名字", "optional": "可选", "send it": "发送", "send it ▶": "发送 ▶",
    "only caleb reads these. no account, no email, nothing public.": "只有 Caleb 会看。无需账号，无需邮箱，不会公开。",
    "optional. tap the same star again to clear": "可选。再点一次同一颗星可清除",
    "how was it?": "好玩吗？", "report a bug / idea": "报告错误 / 提想法",
    "no stars picked": "还没选星星", "0 stars. ouch": "0 星。哎哟", "1 star. rough": "1 星。很差", "2 stars. meh": "2 星。一般",
    "3 stars. decent": "3 星。还行", "4 stars. good one": "4 星。不错", "5 stars. love it": "5 星。太爱了",
    "thanks!": "谢谢！", "back to it ▶": "继续玩 ▶", "sending...": "发送中...", "try again ▶": "再试一次 ▶",
    "pick some stars or write something first": "先选几颗星或写点什么",
    "hang on a few seconds before sending another": "请等几秒再发送下一条",
    "that didn't send. try again?": "没发出去。再试一次？", "feedback is offline right now, sorry": "反馈功能暂时离线，抱歉",
    "back up the pipe": "返回上一页", "← back up the pipe": "← 返回上一页", "back to the menu": "返回菜单", "back to all games": "返回所有游戏",
    "all games free forever no downloads, no sign-up": "所有游戏永久免费，无需下载，无需注册",
    "all games free forever": "所有游戏永久免费", "no downloads, no sign-up": "无需下载，无需注册",
    "page not found": "找不到页面", "the guy walked off the edge looking for this page. there's nothing here.": "小人为了找这个页面走下了悬崖。这里什么都没有。",
    "0 stars": "0 星", "anything at all. what did you think?": "随便说什么。你觉得怎么样？",
    "what broke? what were you doing when it happened? (phone or computer helps too)": "什么坏了？发生时你在做什么？（说明是手机还是电脑更好）",
    "what should be different, or what should we add?": "应该改什么，或者我们该加什么？", "so we can say thanks": "方便我们说声谢谢",
    "the chatroom": "聊天室", "scroll down here to join the room...": "向下滚动到这里加入聊天室...", "not connected": "未连接", "say something...": "说点什么...",
    "sound is on (click to mute)": "声音已开（点击静音）", "sound is off (click to turn on)": "声音已关（点击开启）",
    "music is on (click to stop)": "音乐已开（点击停止）", "music is off (click to play)": "音乐已关（点击播放）",
    "loading": "加载中", "loading...": "加载中...", "loading the book...": "正在加载留言簿...",
    "back": "返回", "close": "关闭", "play": "开始", "again": "再来一次", "new": "新", "new!": "新！", "yes": "是", "no": "否",
    "tip: if da boss is behind you, press": "提示：如果老板在你身后，请按",
  });

  // homepage
  add({
    "free games! no downloads! no sign-up!": "免费游戏！无需下载！无需注册！",
    "small games, smaller stakes. scores reset every day at midnight singapore time.": "小游戏，小赌注。每天新加坡时间午夜重置分数。",
    "you are visitor no.": "你是第几位访客：",
    "news": "新闻", "deep time!": "深度时间！", "8 parts, one forest, 1987. something came through. play it in the dark.": "8个零件，一片森林，1987年。有东西穿过来了。关灯玩。",
    "draw and guess!": "你画我猜！", "make a room, send the link, draw badly with your friends.": "开个房间，发链接，和朋友一起乱画。",
    "we're in alpha!": "我们在测试中！", "things will break. hit the pink": "东西会坏掉。点击粉色的", "bubble and tell us what.": "气泡告诉我们。",
    "rate every game!": "给每个游戏评分！", "0 to 5 stars, right on each game's page. be honest, we can take it.": "0到5星，就在每个游戏页面上。说实话，我们受得住。",
    "city sandbox story mode!": "城市沙盒剧情模式！", "halcyon: 12 chapters, three nights, one very tall ladder.": "宁静号：12章，三个夜晚，一个很高的梯子。",
    "three new word games!": "三个新文字游戏！", "five letters, four sides and word grab. go go go.": "五个字母、四边形和抓单词。冲冲冲。",
    "the word games use a": "文字游戏现在使用", "real dictionary": "真正的词典", "now. 170,000 words, no names.": "了。十七万个单词，不含人名。",
    "scores reset at": "分数在", "midnight singapore time": "新加坡时间午夜重置", ". the leaderboards never sleep.": "。社会信用榜永不休息。",
    "collect stamps in your": "收集印章到你的", "passport": "护照", "just by poking around.": "只需到处逛逛。",
    "alpha": "测试版", "sortafun is brand new and still being built.": "有点烦是全新的，仍在建设中。",
    "something broken? a game you love, or one that stinks? rate it and tell us. every note gets read.": "有东西坏了？有喜欢的游戏，或者很烂的游戏？评分并告诉我们。每条留言都会被阅读。",
    "give feedback": "提交反馈", "nothing found. try \"word\" or \"race\".": "没找到。试试 \"word\" 或 \"race\"。",
    "featured game": "精选游戏", "our scariest one yet. headphones on, lights off.": "我们最吓人的一个。戴上耳机，关灯。",
    "new!": "新！", "deep time": "深度时间", "a flashlight, a camcorder, and eight parts hidden across the woods": "一支手电筒，一台摄像机，和藏在树林里的八个零件",
    "something big turns up behind you, always looking at you": "有个大家伙出现在你身后，一直盯着你",
    "see it? switch off your torch and run": "看到它了？关掉手电筒，快跑", "play now!": "马上玩！",
    "game of the day": "今日游戏", "a different pick every day. go on, you've got time.": "每天不同的推荐。来吧，你有时间。",
    "just played": "刚刚玩过", "checking the scoreboard...": "正在查看社会信用榜...", "see all leaderboards": "查看所有社会信用榜", "see all leaderboards »": "查看所有社会信用榜 »",
    "eighteen games, two of them online with friends. your best today lands on the leaderboards.": "十八个游戏，其中两个可以和朋友联机。你今天的最佳成绩会进入社会信用榜。",
    "all": "全部", "words": "文字", "puzzles": "解谜", "skill": "技巧", "online": "联机", "coming soon": "即将推出",
    "being built right now. nothing to click yet, but tell us which one you want first (feedback bubble).": "正在制作中。暂时不能点，但请告诉我们你最想先玩哪个（反馈气泡）。",
    "draw a flipbook, see everyone else's.": "画一本翻页动画，看看大家的作品。", "talk to whoever else is on the site right now.": "和此刻在网站上的人聊天。",
    "what's new": "最新动态", "how it works": "玩法说明",
    "pick a game. they all run right here in your browser.": "选一个游戏。它们都直接在浏览器里运行。",
    "type a name when you finish to put your score on the board. no account needed.": "完成后输入名字，就能把社会信用记上榜。无需账号。",
    "the daily boards wipe at midnight singapore time. all-time boards stay forever.": "每日社会信用榜在新加坡时间午夜清零。总榜永远保留。",
    "something off? hit": "有问题？点击", "(or the pink rate button and the stars on any game). we're in alpha, it all helps.": "（或任何游戏上的粉色评分按钮和星星）。我们在测试中，每条都有帮助。",
    "best viewed": "最佳分辨率", "800 x 600": "800 x 600", "made with": "制作工具：", "notepad": "记事本", "no cookies": "无 Cookie", "no tracking": "无追踪", "sign my": "来签我的", "guestbook!": "留言簿！",
    "2026 sortafun.org all games free forever made by caleb": "2026 有点烦.org 所有游戏永久免费 由 Caleb 制作",
    "sortafun (alpha) - free games, no downloads!": "有点烦 (测试版) - 免费游戏，无需下载！",
    "sortafun (alpha) - free games, no downloads": "有点烦 (测试版) - 免费游戏，无需下载",
  });

  // the news ticker and What's New list (newest first)
  add({
    ": chinese mode got busy. it is a proper cluttered chinese games portal now, with an i love bj banner up top, and the music is the real thing (midu echoing, played from youtube) the moment you press the button.": "：中文模式变热闹了。现在是一个标准的密密麻麻的中文游戏门户，顶部有“I ♥ BJ”横幅，按下按钮的瞬间就会播放真正的《弥渡山歌》（来自YouTube）。",
    ": a new button in the top bar turns the whole site chinese. red and gold, an 8-bit chinese tune, the guy in a robe and hat, and every scoreboard says social credits. in there the site is called you dian fan.": "：顶栏新增一个按钮，可以把整个网站变成中文。红金配色，8位中国风音乐，小人穿上长袍戴上帽子，所有计分榜都显示社会信用。在中文模式里，网站叫「有点烦」。",
    ": the new thing is better at making sound.": "：新东西的声音更好了。",
    ": a couple of small fixes to the new thing.": "：对新东西做了几个小修复。",
    ": something new is tucked away for a special day. you won't find it on the homepage.": "：有个新东西藏起来了，留给特别的日子。你在首页找不到它。",
    ": deep time dinos look hungrier. the glowing red eyes sit closer together and face front, like a hunter and not something that gets hunted.": "：深度时间里的恐龙看起来更饿了。发光的红眼睛靠得更近，正面朝前，像猎人而不是猎物。",
    ": deep time gets creepier.": "：深度时间更吓人了。",
    ": deep time (both parts): a brightness slider in the menu (default a bit brighter), and plain hints at the moments people got stuck.": "：深度时间（两部分）：菜单里有了亮度滑块（默认稍亮一点），在大家卡住的地方加了清楚的提示。",
    ": word hive saves your progress.": "：单词蜂巢会保存你的进度。",
    ": word hive: a \"clear all\" button (spacebar does it too), and the letter cells are clean hexagons now, no square shadow behind them.": "：单词蜂巢：新增「全部清除」按钮（空格键也行），字母格现在是干净的六边形，后面没有方形阴影了。",
    ": word hive has an archive now. play any past day from the last year; those scores count toward the all time board but never the daily one.": "：单词蜂巢有存档了。可以玩过去一年里的任何一天；这些分数计入总榜，但不计入每日榜。",
    ": deep time part 2 is out. the storm drains under harlan, five samples, and they hunt by sound.": "：深度时间第二部上线了。哈兰地下的雨水管道，五个样本，它们靠声音捕猎。",
    ": deep time: a parts counter that stays up, no more glowing outline, and it turns up right behind you now.": "：深度时间：零件计数器一直显示，不再有发光轮廓，而且它现在会直接出现在你身后。",
    ": behind the closed doors, the desks have people at them now.": "：关着的门后面，桌子旁现在有人了。",
    ": the thing behind closed doors has a proper floor plan now.": "：关着的门后面的东西现在有正经的平面图了。",
    ": something is being built behind closed doors. staff only for now.": "：有东西正在关着的门后面建造。暂时仅限员工。",
    ": what's new goes all the way back now. scroll down to the very first version of the site.": "：最新动态现在能一直翻到最早。往下滚动，看网站的第一个版本。",
    ": sortafun has a version number now, it goes up with every update.": "：有点烦现在有版本号了，每次更新都会增加。",
    "new:": "新：", "tidied the place up.": "整理了一下。",
    "the new look!": "新外观！", "coming soon:": "即将推出：",
    "taka-san dinner simulator": "高桥先生晚餐模拟器", "four sides": "四边形", "word grab": "抓单词", "city sandbox": "城市沙盒",
    "beeber fever": "小蜜蜂热", "the bee all end all": "蜜蜂终极王", "the bee all end all.": "蜜蜂终极王。",
    "wannabee": "想当蜜蜂", "bee-ginner": "蜜蜂新手", "buzzy bee": "嗡嗡蜂", "busy bee": "忙碌蜂", "worker bee": "工蜂", "bee-dazzling": "蜂采耀眼",
    "the bee's knees": "顶呱呱", "unbee-lievable": "难以蜂信", "hive mind": "蜂巢意识", "queen bee": "蜂后",
    "(first from the bottom)": "(倒数第一)", "first from the bottom": "倒数第一",
    "the new thing": "新东西", "alpha.": "测试版。",
  });

  // game names and the pieces of each game page
  add({
    "page title": "页面标题",
    "aim trainer": "瞄准训练", "click the dot. it jumps somewhere new every time you hit it. thirty seconds, count the hits.": "点击圆点。每次点中它都会跳到新的位置。三十秒，数命中次数。",
    "time": "时间", "hits": "命中", "acc": "准确率",
    "word hive": "单词蜂巢", "got a codephrase?": "有口令吗？", "continue": "继续", "score": "分数", "found": "已找到", "delete": "删除", "clear all": "全部清除",
    "shuffle": "打乱", "enter": "确认", "type or click letters. the gold one is required in every word.": "输入或点击字母。每个单词必须包含金色字母。",
    "i'm done, submit score": "我完成了，提交分数", "rank": "等级", "archive: play a past day": "存档：玩过去的一天",
    "seven letters, one of them mandatory (gold). find every word you can, 4+ letters, reuse letters as often as you like. any real word counts, no names. no clock, stop whenever and submit your score. same seven letters for everyone today. the ranks on the meter scale with the day's letters: a hard hive gets you to the top with fewer points.": "七个字母，其中一个必须使用（金色）。找出你能找到的所有单词，至少4个字母，字母可重复使用。任何真正的单词都算，人名不算。没有计时，随时停下并提交分数。今天所有人的七个字母相同。等级条随当天的字母调整：难的蜂巢用更少的分数就能到顶。",
    "animation gallery": "动画画廊", "flipbooks people made, each looping at the speed it was drawn. vote and comment.": "大家制作的翻页动画，按绘制速度循环播放。可以投票和评论。",
    "make your own": "做你自己的", "top": "热门", "newest": "最新", "load more": "加载更多", "back to the studio": "返回工作室",
    "city sandbox": "城市沙盒", "poo-cam": "鸟粪相机", "birdie": "小鸟", "poo-o-meter": "鸟粪计", "your look": "你的造型", "pick your bird": "选你的小鸟",
    "story": "剧情", "online": "联机", "one city, everyone in it": "一座城市，所有人都在里面", "graphics": "画质", "low": "低", "medium": "中", "high": "高",
    "music": "音乐", "voices": "语音", "difficulty": "难度", "easy": "简单", "normal": "普通", "hard": "困难", "new story": "新剧情",
    "you didn't make it": "你没有成功", "retry from checkpoint": "从检查点重试", "restart the chapter": "重玩本章", "quit to chapters": "退出到章节",
    "chapter complete": "章节完成", "next chapter": "下一章", "chapters": "章节", "building the world...": "正在构建世界...",
    "paused": "已暂停", "keep playing": "继续游戏", "sound": "声音", "stop the clock": "停止计时", "end post score": "结束并提交分数",
    "flown away": "飞走了", "you lost your last life.": "你失去了最后一条命。", "fly again": "再飞一次",
    "inventory": "背包", "shop": "商店", "crew": "队伍", "map": "地图", "guns": "枪械", "ammo gear": "弹药装备", "defences": "防御", "rides": "载具", "outfits": "服装",
    "sell": "出售", "find me": "找到我", "you": "你", "players": "玩家", "radio mast": "无线电塔", "drop": "空投", "metro": "地铁", "hangar": "机库",
    "survive the night. get out.": "撑过今夜。逃出去。", "skip intro": "跳过开场", "press again to skip": "再按一次跳过", "skip": "跳过", "lift": "电梯",
    "loot it, build, survive. one world, everyone in it. no downloads!": "搜刮、建造、生存。一个世界，所有人都在其中。无需下载！",
    "crossword": "填字游戏", "loading": "加载中", "check": "检查", "reveal square": "显示方格", "reveal grid": "显示全部", "clear": "清除", "across": "横向", "down": "纵向",
    "deep time part 2": "深度时间 第二部", "deep time: part 2": "深度时间：第二部", "play with headphones, with the lights off.": "戴耳机，关灯玩。", "part 2 is out": "第二部已上线",
    "part 1 is here": "第一部在这里", "play tape": "播放录像带", "play footage": "播放录像",
    "contains sudden loud sounds, flashing static and jumpscares.": "含有突然的巨响、闪烁的雪花噪点和惊吓画面。",
    "a camcorder tape from a forest in montana, october 1987. something came through a hole in time. find the 8 parts of the machine before it finds you.": "1987年10月，蒙大拿一片森林里的摄像带。有东西穿过了时间的裂缝。在它找到你之前，找齐机器的8个零件。",
    "body camera footage from the storm drains under harlan, montana, october 2026. dogs have been going missing. so did the sewer crew that went down to look. collect five samples and find out what's living down there.": "2026年10月，蒙大拿哈兰地下雨水管道的执法记录仪录像。狗不断失踪，下去查看的下水道工人也失踪了。收集五个样本，查明下面住着什么。",
    "turn your phone sideways": "请把手机横过来", "volume": "音量", "brightness": "亮度", "picture": "画面", "look": "视角", "resume": "继续", "eject": "弹出", "signal lost": "信号丢失",
    "draw and guess": "你画我猜", "one person draws, everyone else guesses in the chat. guess fast for more points, and the artist scores when you get it. 2 to 8 players: make a room and send your friends the link.": "一个人画，其他人在聊天里猜。猜得越快得分越多，你猜对了画的人也得分。2到8名玩家：开个房间，把链接发给朋友。",
    "make a room": "创建房间", "or join a friend's room": "或加入朋友的房间", "join": "加入", "lobby": "大厅", "pen": "画笔", "fill": "填充", "eraser": "橡皮", "undo": "撤销", "send": "发送",
    "room": "房间", "copy invite link": "复制邀请链接", "leave room": "离开房间",
    "circuit race": "赛道竞速", "drive to the start/finish line to begin, collect every glowing checkpoint gem in order, then cross the line again to set a lap time, and keep going, every lap after that starts right away. feel free to leave the road, nothing stops you, grass is just a little slower. steer, gas / brake, shift to boost, ctrl to drift.": "开到起终点线开始，按顺序收集每个发光的检查点宝石，再次越过终点线记录单圈时间，然后继续，之后每一圈立刻开始。可以随便离开道路，没人拦你，草地只是稍慢一点。转向，油门/刹车，Shift加速，Ctrl漂移。",
    "loading circuit": "正在加载赛道", "boost": "加速", "drift": "漂移", "restart": "重新开始",
    "five letters": "五个字母", "guess today's five letter word in six tries. every guess has to be a real word. same word for everyone today, and you only get one go at it.": "六次机会猜出今天的五字母单词。每次猜测必须是真正的单词。今天所有人的单词相同，而且只有一次机会。",
    "right spot": "位置正确", "wrong spot": "位置错误", "not in it": "不在单词里", "start typing": "开始输入",
    "animation studio": "动画工作室", "draw a frame, add another, flip through them at 8, 12 or 16 fps. faint red = the frame before.": "画一帧，再加一帧，以每秒8、12或16帧翻看。淡红色 = 上一帧。",
    "line": "直线", "square": "方形", "circle": "圆形", "eraser size": "橡皮大小", "onion skin (show previous frames)": "洋葱皮（显示前几帧）", "fps": "帧率", "frame": "帧",
    "prev": "上一帧", "next": "下一帧", "+ blank frame": "+ 空白帧", "+ copy frame": "+ 复制帧", "clear frame": "清除帧", "delete frame": "删除帧", "start over": "重新开始",
    "post to gallery": "发布到画廊", "browse gallery": "浏览画廊",
    "art gallery": "艺术画廊", "word grab": "抓单词", "start!": "开始！", "some you missed": "你错过的一些",
    "two minutes. make words from letters that touch (sideways, up, down or diagonal), 3+ letters, each cube once per word. type them or tap the cubes. longer words score way more. same grid for everyone today.": "两分钟。用相邻的字母（横、竖或斜）组成单词，至少3个字母，每个方块每个单词只能用一次。可以输入，也可以点方块。越长的单词分数越高。今天所有人的格子相同。",
    "3-4 letters = 1pt, 5 = 2, 6 = 3, 7 = 5, 8+ = 11": "3-4个字母 = 1分，5个 = 2分，6个 = 3分，7个 = 5分，8个以上 = 11分",
    "guestbook": "留言簿", "~ sign my guestbook ~": "~ 来签我的留言簿 ~", "you are visitor. leave a mark.": "你是访客。留下痕迹吧。",
    "messages daily (maybe). no take-backs, it's written in pen.": "每天都有留言（也许）。不能撤回，这是用钢笔写的。", "your name / handle": "你的名字 / 昵称", "your message": "你的留言", "sign it": "签名", "older entries": "更早的留言",
    "word hive archive": "单词蜂巢存档", "pick any past day (up to a year back) to play its hive. green days have scores. your score counts toward the all time leaderboard, but not the daily one.": "选择过去任何一天（最多一年前）来玩当天的蜂巢。绿色的日子有分数。你的分数计入总榜，但不计入每日榜。",
    "has scores": "有分数", "playable, no scores yet": "可玩，暂无分数", "loading past scores": "正在加载历史分数", "back to today's hive": "返回今天的蜂巢",
    "play this day's hive": "玩这一天的蜂巢", "play this day's hive. your score counts toward the all time leaderboard, but not the daily one.": "玩这一天的蜂巢。你的分数计入总榜，但不计入每日榜。",
    "su": "日", "mo": "一", "tu": "二", "we": "三", "th": "四", "fr": "五", "sa": "六",
    "word ladder": "单词阶梯", "change one letter at a time, every step a real four letter word, from the green word to the red word. same ladder for everyone today. fewest rungs wins.": "每次改一个字母，每一步都是真正的四字母单词，从绿色单词走到红色单词。今天所有人的阶梯相同。步数最少者获胜。",
    "to": "到", "par": "标准", "rungs": "阶数", "add rung": "加一阶",
    "leaderboards": "社会信用榜", "leaderboard": "社会信用榜", "top scores. today and all time. play a game, submit, come back and gloat.": "社会信用最高者。今日和总榜。玩游戏，提交，回来炫耀。",
    "cursor maze": "光标迷宫", "mouse from the green corner to the red corner without touching a wall. the clock starts when you leave the start box. touch a wall and you go back to the start. mouse only.": "鼠标从绿色角走到红色角，不能碰墙。离开起点框时开始计时。碰到墙就回到起点。只能用鼠标。",
    "move into the green box to start": "移入绿色方框开始", "new maze": "新迷宫",
    "minesweeper": "扫雷", "nine by nine, ten mines. left click clears, right click (or long press) flags. first click is always safe. clear every empty square as fast as you can.": "九乘九，十颗雷。左键清除，右键（或长按）插旗。第一下点击一定安全。尽快清除所有空格。",
    "mines left": "剩余地雷", "left click a square to begin": "左键点击一个方格开始", "new board": "新棋盘",
    "stamps you collect just by poking around the site. all kept in this browser only, nothing is sent anywhere.": "只要在网站上到处逛就能收集印章。全部只保存在这个浏览器里，不会发送到任何地方。",
    "board name:": "榜上名字：", "wipe my passport": "清除我的护照",
    "profile": "个人资料", "every score a name has left on the boards. type a name (or share the link with": "一个名字在榜上留下的所有社会信用。输入名字（或分享带有",
    "?name=": "?name=", "look up": "查询", "game": "游戏", "best": "最佳", "tries": "次数",
    "tile slider": "滑块拼图", "slide the tiles into order. same scramble for everyone today. arrow keys or click.": "把方块滑动到正确顺序。今天所有人的打乱方式相同。方向键或点击。",
    "moves:": "步数：", "time:": "时间：", "shuffle again": "重新打乱", "today's puzzle": "今日谜题",
    "reaction light": "反应灯", "click to start. wait for the bottom lamp to light up, then click as fast as you can. click early and the round is void. five rounds, your average is the score.": "点击开始。等最下面的灯亮起，然后尽快点击。点早了这一轮作废。五轮，平均值就是分数。",
    "click the light to begin": "点击灯开始",
    "four sides": "四边形", "use all twelve letters. words need 3+ letters, and you can't use two letters from the same side in a row. each new word starts with the last letter of the one before. fewest words wins. same box for everyone today.": "用完全部十二个字母。单词至少3个字母，不能连续使用同一边上的两个字母。每个新单词以前一个单词的最后一个字母开头。单词数最少者获胜。今天所有人的方框相同。",
    "par today:": "今日标准：", "type or click letters": "输入或点击字母",
    "sfsg slacking simulator": "SFSG 摸鱼模拟器", "work in progress": "制作中", "the office, rebuilt in 3d. do as little as possible from 9 to 6 without getting caught.": "3D重建的办公室。从九点到六点尽量少干活，还不被抓到。",
    "slack": "摸鱼", "eye": "眼睛", "phone": "手机", "alt-tab": "切换窗口", "nap": "打盹", "clock in": "打卡上班", "another day": "再来一天", "staff only": "仅限员工",
    "this one's still being built. enter the password.": "这个还在制作中。请输入密码。", "badge in": "刷卡进入",
    "9:00am. mr. goh is walking the floor. earn slack points for every second you're not working. three strikes and he'd like a quick word.": "早上9:00。吴先生正在巡视。你每一秒不工作都能赚摸鱼分。被抓三次他就要找你谈话了。",
    "stop the bar": "停住指针", "the marker sweeps back and forth. click or hit space to stop it inside the green band. every hit shrinks the band and speeds things up. one miss and you are out.": "指针来回摆动。点击或按空格把它停在绿色区域内。每次命中区域会变小，速度会变快。失误一次就出局。",
    "click or press space to start": "点击或按空格开始",
    "taka-san dinner simulator": "高桥先生晚餐模拟器", "dinner simulator": "晚餐模拟器",
    "taka-san is over from hq. drive him to dinner, seat the table properly, keep his glass full, answer his questions, and survive karaoke. win his favour and you might get a trip to japan.": "高桥先生从总部过来了。开车送他去吃饭，把座位安排好，让他的杯子一直满着，回答他的问题，并撑过卡拉OK。赢得他的欢心，你可能会得到一次日本之旅。",
    "this dinner is invitation only. enter the password.": "这顿晚餐仅限受邀者。请输入密码。", "open": "打开", "let's go": "出发", "seat the table": "安排座位", "everyone's seated": "大家都坐好了",
    "just sit anywhere": "随便坐", "pour for taka-san": "给高桥先生倒酒", "call the waitress": "叫服务员", "more beer": "再来点啤酒", "more food": "再来点食物", "the bill": "买单", "keep": "保持",
    "dinner again": "再吃一顿", "tambourine (space)": "铃鼓（空格）",
    "typing game": "打字游戏", "typing test": "打字测试", "type the words. the caret follows you, wrong letters go red. 30 seconds.": "输入单词。光标跟着你，打错的字母会变红。30秒。",
    "top 200 words": "前200个单词", "top 1000 words": "前1000个单词", "easier: the 200 most common english words": "较简单：最常见的200个英语单词",
    "click here or press any key to focus": "点击这里或按任意键开始", "wpm": "每分钟字数", "test type": "测试类型", "characters": "字符", "raw": "原始速度", "consistency": "稳定性", "english": "英语",
  });

  // scoreboards: every board says social credits (社会信用)
  add({
    "today": "今日", "all time": "总榜", "your name": "你的名字", "loading...": "加载中...",
    "nobody yet today. be the first.": "今天还没有人。当第一个吧。", "nobody yet. be the first.": "还没有人。当第一个吧。",
    "leaderboard offline": "社会信用榜离线", "leaderboard error (open console)": "社会信用榜出错（打开控制台）",
    "type a name first": "请先输入名字", "try again": "再试一次",
    "leaderboard offline, score not saved": "社会信用榜离线，社会信用未保存",
    "the board refused that score (tell us with the feedback button)": "榜单拒绝了这个社会信用（用反馈按钮告诉我们）",
    "couldn't save, check your connection and try again": "保存失败，请检查网络后重试",
    "typing, top 200 words - most wpm": "打字，前200词：社会信用最高", "typing, top 1000 words - most wpm": "打字，前1000词：社会信用最高",
    "circuit race - best lap": "赛道竞速：最快单圈社会信用", "tile slider - fewest moves": "滑块拼图：步数最少",
    "reaction light - fastest average": "反应灯：平均最快", "cursor maze - fastest run": "光标迷宫：最快通关",
    "aim trainer - most hits": "瞄准训练：命中最多", "stop the bar - most points": "停住指针：社会信用最高",
    "word ladder - fewest rungs": "单词阶梯：阶数最少", "word hive - most points": "单词蜂巢：社会信用最高",
    "five letters - fewest guesses": "五个字母：猜测最少", "four sides - fewest words": "四边形：单词最少",
    "word grab - most points": "抓单词：社会信用最高", "city sandbox - most cash": "城市沙盒：现金最多",
    "deep time - most parts, then fastest": "深度时间：零件最多，其次最快", "deep time part 2 - most samples, then fastest": "深度时间第二部：样本最多，其次最快",
    "taka-san dinner simulator - most favour": "高桥先生晚餐模拟器：好感最高", "birdie - most points": "小鸟：社会信用最高", "minesweeper - fastest clear": "扫雷：最快清除",
    "every game with a score is here. look up one name's whole history on the": "每个有分数的游戏都在这里。在", "profile page": "个人资料页面",
    ". on any \"all time\" board the very last place glows gold, first from the bottom. crossword and the animation studio have nothing to rank, so they're not listed. scores are submitted straight from your browser, so treat the numbers with a pinch of salt.": "查看某个名字的全部记录。在任何「总榜」上，最后一名会发出金光，倒数第一。填字游戏和动画工作室没有可排名的内容，所以没有列出。社会信用直接从你的浏览器提交，所以数字请半信半疑。",
    "social credits": "社会信用", "social credit": "社会信用",
  });

  // the small stuff on the other pages: footer, chat strip, passport, hive meter, controls, HUD labels
  add({
    "· all games free forever · no downloads, no sign-up": "· 所有游戏永久免费 · 无需下载，无需注册",
    "quiet in here. messages vanish after a minute, so say something.": "这里很安静。消息一分钟后消失，所以说点什么吧。",
    "click the dot to start": "点击圆点开始", "rank:": "等级：", "today's hive:": "今日蜂巢：", "tricky": "有点难", "more points to": "还差几分到", "saved with codephrase": "已保存，口令是",
    "first score": "第一笔社会信用", "post to any leaderboard": "登上任意社会信用榜", "regular": "常客", "score on five different games": "在五个不同的游戏中获得社会信用",
    "the lot": "全部拿下", "score on every game": "在每个游戏中获得社会信用", "the long walk": "漫长的路", "scroll the homepage all the way down": "把首页一直滚到底",
    "chatterbox": "话痨", "say something in the chatroom": "在聊天室说句话", "green thumb": "绿手指", "find the art gallery": "找到艺术画廊", "left a mark": "留下痕迹",
    "sign the guestbook": "签留言簿", "alpha tester": "测试员", "send feedback from the pink bubble": "用粉色气泡发送反馈", "night shift": "夜班", "visit between 2 and 5am": "凌晨2点到5点之间来访",
    "time 30": "时间 30", "00:00:30 session": "00:00:30 本次", "move": "移动", "mouse look": "鼠标视角", "run": "奔跑", "light": "手电", "grab": "拾取",
    "dive": "俯冲", "call": "召唤", "fire": "开火", "jump": "跳跃", "use": "使用", "aim": "瞄准", "menu": "菜单", "poo": "鸟粪",
    "pigeon": "鸽子", "crow": "乌鸦", "seagull": "海鸥", "starling": "椋鸟", "eagle": "老鹰", "robin": "知更鸟", "barn owl": "仓鸮", "ringneck": "环颈鹦鹉", "macaw": "金刚鹦鹉", "swan": "天鹅",
    "(more outfits in the shop)": "(商店里有更多服装)", "(you found the birds)": "(你找到了小鸟)", "invert up/down": "上下反转", "halcyon": "宁静号", "halcyon: 12 chapters, on your own": "宁静号：12章，单人游玩",
    "left / right": "左 / 右", "turn": "转向", "down / s": "下 / S", "up / w": "上 / W", "let go": "松开", "swoop down": "俯冲而下", "camera": "镜头", "pause": "暂停", "end & post score": "结束并提交分数",
    "ammo & gear": "弹药和装备", "press a number or click. f to stay put.": "按数字键或点击。按F留在原地。", "story mode:": "剧情模式：", "the goal:": "目标：", "day and night:": "昼夜：",
    "going down:": "倒下后：", "crews:": "队伍：", "getting stronger:": "变强：", "loot and the city:": "战利品与城市：",
    "one big city gone quiet, except for the zombies. play the story on your own, or go online and get dropped somewhere random with everyone else. loot the insides of buildings (that's where the money is), buy guns and barricades, ride the lifts up the towers, get down into the metro, and don't let them get close.": "一座安静下来的大城市，除了僵尸。你可以单人玩剧情，也可以联机，和其他人一起被随机投放到某处。搜刮建筑内部（钱都在那里），买枪和路障，坐电梯上高楼，下到地铁里，别让它们靠近。",
    "how it works:": "玩法说明：", "waiting": "等待中", "connecting...": "连接中...", "offline": "离线", "the chatroom can't connect right now. try again in a bit.": "聊天室暂时连不上。请稍后再试。",
    "slack": "摸鱼", "9:00am": "上午9:00", "wasd / arrows walk": "WASD / 方向键 行走", "pause ii": "暂停 II", "menu": "菜单", "space to skip": "按空格跳过", "dawn (finish the tape)": "黎明（看完录像带）",
    "low (faster)": "低（更快）", "(reload to apply)": "(重新加载后生效)", "about 20 mb of forest, animals and sound, the first time.": "第一次约需下载20 MB的森林、动物和声音。",
    "about 25 mb of drains, raptors and sound, the first time.": "第一次约需下载25 MB的管道、迅猛龙和声音。", "part 2 ▶": "第二部 ▶",
    "rewind & play again": "倒带并重播", "left thumb: walk · right thumb: look": "左拇指：行走 · 右拇指：视角", "they hunt by sound.": "它们靠声音捕猎。",
    "a key": "A键", "d key": "D键", "f key": "F键", "s key": "S键", "key": "键",
    "taka-san's glass": "高桥先生的杯子", "bottles:": "酒瓶：", "seat the table": "安排座位",
    "typing (top 200)": "打字（前200词）", "typing (top 1000)": "打字（前1000词）", "driving game": "驾驶游戏", "anagram sprint": "字谜冲刺", "fermi quiz": "费米问答",
    "loading past scores...": "正在加载历史分数...", "404": "404", "sfsg slacking simulator (work in progress)": "SFSG 摸鱼模拟器（制作中）",
  });

  // homepage game tiles, categories, badges, feedback game names
  add({
    "draw and guess": "你画我猜", "taka-san dinner": "高桥先生晚餐", "deep time 2": "深度时间 2", "deep time: part 2": "深度时间：第二部",
    "slacking simulator": "摸鱼模拟器", "sfsg slacking simulator": "SFSG 摸鱼模拟器", "the farewell card": "告别贺卡", "the forum": "论坛",
    "profile pages": "个人资料页", "the secret room": "秘密房间", "typing test": "打字测试", "tile slider": "滑块拼图", "circuit race": "赛道竞速",
    "reaction light": "反应灯", "stop the bar": "停住指针", "animation studio": "动画工作室", "animation gallery": "动画画廊",
    "one of you draws, the rest guess in the chat. make a room, send your friends the link. 2 to 8 players.": "你们当中一个人画，其他人在聊天里猜。开个房间，把链接发给朋友。2到8名玩家。",
    "drive the boss to dinner, seat the table right, keep his glass full, answer his big questions, then karaoke. win a trip to japan.": "开车送老板去吃饭，安排好座位，让他的杯子一直满着，回答他的大问题，然后唱卡拉OK。赢一次日本之旅。",
    "part 2: body camera footage from the storm drains under a montana town. five samples. they hunt by sound.": "第二部：蒙大拿小镇地下雨水管道的执法记录仪录像。五个样本。它们靠声音捕猎。",
    "a camcorder tape from a forest in 1987. find the 8 parts of the time machine. something came through. headphones on.": "1987年一片森林里的摄像带。找齐时间机器的8个零件。有东西穿过来了。戴上耳机。",
    "online zombie survival. crew up, hold your safehouse through the night, fuel the radio mast and catch the chopper out.": "联机僵尸生存。组队，守住安全屋过夜，给无线电塔加油，搭直升机逃出去。",
    "a 15x15 themeless grid by caleb. snacky, quick, and some clues bite back.": "Caleb 做的15x15无主题格子。轻松快速，有些提示会反咬一口。",
    "guess today's secret five letter word in six tries. colours tell you how close you are.": "六次机会猜今天的秘密五字母单词。颜色会告诉你有多接近。",
    "twelve letters round a box. chain words together until you've used them all.": "方框周围十二个字母。把单词接龙连起来，直到用完所有字母。",
    "a 4x4 grid of letter cubes and two minutes. grab every word you can find.": "4x4的字母方块和两分钟。抓住你能找到的每一个单词。",
    "seven letters, one in the middle. find every word you can. no clock.": "七个字母，一个在中间。找出你能找到的所有单词。没有计时。",
    "change one letter at a time to climb from the top word to the bottom one.": "每次改一个字母，从上面的单词爬到下面的单词。",
    "thirty seconds. how many words per minute have you got?": "三十秒。你每分钟能打多少字？",
    "slide the numbers back in order. one board for everyone each day.": "把数字滑回正确顺序。每天所有人同一块板。",
    "the classic. clear the field without stepping on a mine.": "经典游戏。清除场地，别踩到地雷。",
    "steer your mouse down the path. the walls are lava.": "用鼠标沿着小路走。墙是岩浆。",
    "three laps of a 3d track against the clock. hug the corners.": "3D赛道三圈，与时间赛跑。贴紧弯道。",
    "wait for green, then click. too early and you're out.": "等绿灯，然后点击。点早了就出局。",
    "pop as many targets as you can before time runs out.": "在时间用完前打爆尽可能多的目标。",
    "the marker zooms back and forth. stop it dead in the middle.": "指针来回飞奔。把它正好停在中间。",
    "draw a flipbook frame by frame with onion skin, then post it to the gallery once it moves.": "用洋葱皮一帧一帧画翻页动画，动起来后发布到画廊。",
    "everyone else's flipbooks. vote for your favourite and leave a comment.": "大家的翻页动画。给你最喜欢的投票并留言。",
    "a message board that has been arguing since 2003.": "一个从2003年吵到现在的留言板。", "every game's top scores, today and all time.": "每个游戏的最高社会信用，今日和总榜。",
    "sign it! no take-backs, it's written in pen.": "签名吧！不能撤回，这是用钢笔写的。", "stamps you earn just by poking around the site.": "只要在网站上到处逛就能获得的印章。",
    "the office, rebuilt in 3d. alt-tab before the manager walks past, answer teams in time, and sneak down to starbucks.": "3D重建的办公室。经理走过前切换窗口，及时回复Teams，偷偷溜去星巴克。",
    "sfsg slacking simulator": "SFSG 摸鱼模拟器", "hot dog bush": "热狗布什", "sushi go round": "回转寿司", "frontier pets": "前线宠物",
    "the old political hot dog stand. grill it, dress it, serve it before the queue loses its patience.": "老牌政治热狗摊。烤，加料，在队伍失去耐心前上菜。",
    "roll sushi from the recipe book, send it round the belt, and don't run out of salmon.": "照着食谱卷寿司，送上传送带，别让三文鱼用完。",
    "adopt a pet and build it a home out of modular units. feed it with points from every game on the site.": "领养一只宠物，用模块单元给它盖个家。用网站上每个游戏的社会信用喂它。",
    "soon": "即将", "puzzle": "解谜", "art": "艺术",
    "daily": "每日", "hot!": "热门！", "today": "今日", "wip": "制作中",
    "no scores yet today. be the first!": "今天还没有社会信用记录。当第一个吧！",
    "just in:": "最新：", "someone": "某人",
  });

  // sushi goes round (sushi.html): the static lines. Dish names, buttons, HUD labels, the menu cards.
  add({
    "sushi goes round": "回转寿司",
    "run a conveyor belt sushi bar. roll what the customers ask for, send it round the belt, phone for more salmon. career, endless and a daily lunch rush.": "经营一家回转寿司店。按顾客点的菜卷寿司，送上传送带，三文鱼不够就打电话订货。有生涯模式、无尽模式和每日午餐高峰。",
    "you're the new chef at a conveyor belt sushi bar. roll what each customer asks for and send it round the belt. don't run out of rice, don't let anyone's stars run out, and phone the supplier before the salmon is gone.": "你是回转寿司店的新厨师。按每位顾客点的菜卷寿司，送上传送带。别让米饭用完，别让任何人的星星掉光，三文鱼用完之前记得给供应商打电话。",
    "best on a wider screen or with your phone sideways. tap to click.": "屏幕宽一点或者把手机横过来更好玩。点一下就是点击。",
    "neko maru kaiten sushi, now hiring one (1) chef": "猫丸回转寿司，现招聘厨师一（1）名",
    "career": "生涯模式", "endless service": "无尽营业", "lunch rush": "午餐高峰",
    "continue": "继续", "new career": "重新开始生涯", "how to play": "玩法", "got it": "知道了",
    "fifteen days to prove yourself. new dishes every few days, more seats, grumpier customers. hit the money goal to move on.": "十五天证明自己。每隔几天有新菜，座位更多，顾客更暴躁。达到金额目标才能进入下一天。",
    "one long night, getting busier. play until your reputation runs out. score is the yen you took in.": "漫长的一晚，越来越忙。一直玩到口碑耗尽。分数就是你收进来的日元。",
    "two minutes, full menu, same customers for everyone today. earn as much as you can. daily board.": "两分钟，完整菜单，今天所有人面对同样的顾客。尽可能多赚钱。每日榜。",
    "music": "音乐", "music: on": "音乐：开", "music: off": "音乐：关", "pause": "暂停", "full screen": "全屏", "paused": "已暂停",
    "keep cooking": "继续做菜", "quit to menu": "返回菜单", "restart the day": "重新开始这一天", "restart run": "重新开始",
    "time": "时间", "goal": "目标", "rep": "口碑", "wallet": "钱包", "earned": "已赚", "open for": "营业时间",
    "open the doors": "开门营业", "to the kitchen": "进厨房", "menu": "菜单", "try again": "再试一次", "play again": "再玩一次",
    "recipe book": "食谱", "back to the kitchen": "回到厨房", "phone the supplier": "给供应商打电话",
    "recipes": "食谱", "phone": "电话", "bin": "垃圾桶", "the mat": "寿司帘", "on the menu": "菜单上有", "new on the menu": "菜单上新增",
    "rice": "米饭", "nori": "海苔", "roe": "鱼子", "salmon": "三文鱼", "shrimp": "虾", "unagi": "鳗鱼", "sake": "清酒",
    "onigiri": "饭团", "california roll": "加州卷", "gunkan maki": "军舰卷", "salmon roll": "三文鱼卷", "shrimp sushi": "虾寿司",
    "combo sushi": "综合寿司", "unagi roll": "鳗鱼卷", "dragon roll": "龙卷", "rainbow roll": "彩虹卷", "emperor roll": "皇帝卷",
    "money taken": "营业额", "tips": "小费", "lucky cat bonuses": "招财猫奖金", "happy customers": "满意的顾客", "stormed out": "气走的顾客",
    "dishes eaten": "吃掉的菜", "best lucky streak": "最长连胜", "closed for the night": "今晚打烊", "that's lunch": "午餐结束",
    "paused.": "已暂停。", "sushi goes round, endless service - most yen": "回转寿司，无尽营业：社会信用最高",
    "sushi goes round, lunch rush - most yen": "回转寿司，午餐高峰：社会信用最高",
    ": new: sushi goes round. you run a conveyor belt sushi bar. roll what each customer asks for, send it round the belt, phone the supplier before the salmon runs out, and pour sake on anyone about to storm off. career mode, endless service and a daily lunch rush with its own leaderboards.": "：新游戏：回转寿司。你来经营一家回转寿司店。按每位顾客点的菜卷寿司，送上传送带，三文鱼用完之前打电话向供应商订货，谁快要气走就给谁倒杯清酒。有生涯模式、无尽营业和每日午餐高峰，各有自己的社会信用榜。",
    "twenty games, two of them online with friends. your best today lands on the leaderboards.": "二十个游戏，其中两个可以和朋友联机。你今天的最佳成绩会进入社会信用榜。",
  });

  // every scoreboard says social credits, so every "score" (分数) in the lines above is too
  for (var dk in D) if (D[dk].indexOf("分数") >= 0) D[dk] = D[dk].replace(/分数/g, "社会信用");

  // ---------------------------------------------------------------
  // pattern rules for lines with a number or a name in them
  // ---------------------------------------------------------------
  var UNITS = /^(wpm|moves|ms|hits|pts|rungs|words|guesses|cash|parts|samples|streak|score|s|points)$/;
  function ruleXlate(core, el) {
    var m;
    // a scoreboard row or the submit button: the unit becomes social credits
    var inLb = el && el.closest && el.closest(".lb, .board-col, .lb-score, .lb-ok, .lb-go, #livelist, #tickrun");
    if (inLb) {
      if ((m = /^got (.+) in$/.exec(core))) return "获得 " + creditText(m[1]) + "，游戏：";
      if ((m = /^(.*) scored (.+) at (.+)\.$/.exec(core))) return m[1] + " 得到 " + creditText(m[2]) + "，游戏：" + (D[m[3]] || m[3]) + "。";
      if (el.classList && el.classList.contains("lb-score")) {
        m = /^(.*?)(?: ([a-z]+))?$/.exec(core);
        return m[1] + " 社会信用";
      }
      if ((m = /^submit (.+)$/.exec(core))) return "提交 " + creditText(m[1]);
      if ((m = /^saved! (.+?) · (.+)$/.exec(core))) return "已保存！" + m[1] + " · " + creditText(m[2]);
      if (/^sending\.\.\.$/.test(core)) return "发送中...";
    }
    // "28 sep 2026, 9:37pm" (board rows, Singapore time)
    if ((m = /^(\d+) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec) (\d{4}), (\d+):(\d\d)(am|pm)$/.exec(core))) {
      var mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]) + 1;
      return m[3] + "年" + mon + "月" + m[1] + "日 " + (m[6] === "am" ? "上午" : "下午") + m[4] + ":" + m[5];
    }
    if ((m = /^rate (.+)$/i.exec(core)) && D[m[1].toLowerCase()]) return "评分：" + D[m[1].toLowerCase()];
    if ((m = /^you gave it (\d) stars?\. tap to rate again$/.exec(core))) return "你给了 " + m[1] + " 星。点击可重新评分";
    // the profile page's table: "126 wpm" in a cell, "1 game · 1 scores" under the name
    if (el && el.closest && el.closest("td") && (m = /^(.+?) (wpm|moves|ms|hits|pts|rungs|words|guesses|cash|parts|samples|streak|score|points)$/.exec(core))) return m[1] + " 社会信用";
    if ((m = /^(\d+) games? · (\d+) scores?$/.exec(core))) return m[1] + " 个游戏 · " + m[2] + " 笔社会信用";
    if ((m = /^(\d+) here now$/.exec(core))) return m[1] + " 人在线";
    if ((m = /^comments? \((\d+)\)$/.exec(core))) return "评论 (" + m[1] + ")";
    if ((m = /^(\d+) of (\d+) stamps\s*·\s*scored on (\d+) \/ (\d+) games$/.exec(core))) return m[1] + " / " + m[2] + " 枚印章 · 已在 " + m[3] + " / " + m[4] + " 个游戏中获得社会信用";
    if ((m = /^(\d+) \/ (\d+)$/.exec(core))) return null;
    if ((m = /^(january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})$/.exec(core))) {
      return m[2] + "年" + (["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(m[1]) + 1) + "月";
    }
    // page titles: "reaction light · SORTAFUN.ORG" or "aim trainer SORTAFUN.ORG"
    if ((m = /^(.+?)(?: · | )sortafun\.org$/i.exec(core)) && D[m[1].toLowerCase()]) return D[m[1].toLowerCase()] + " | 有点烦.org";
    if ((m = /^(?:v)?(\d+\.\d+(?:\.\d+)?)$/.exec(core))) return null;
    if ((m = /^\(alpha\) (v[\d.]+)$/i.exec(core))) return "(测试版) " + m[1];
    if ((m = /^par (\d+) rungs?$/.exec(core))) return "标准 " + m[1] + " 阶";
    if ((m = /^(\d+) \/ 1000$/.exec(core))) return null;
    return null;
  }
  function creditText(s) {
    var m = /^(.*?)(?: ([a-z]+))?$/.exec(s);
    return m[1] + " 社会信用";
  }

  // ---------------------------------------------------------------
  // the text walker
  // ---------------------------------------------------------------
  // places that must never be translated: word-game play areas (found words,
  // the typing test's word stream, letter tiles, ladders, crossword clues),
  // anything a visitor typed (names, chat, guestbook) and code
  var SKIP = "script,style,noscript,textarea,input,code,pre,svg text," +
    "#words,#found,#missed,#cur,#grid,#board,#keys,#box,#chain,#startW,#endW,#hive,#across,#down,#cluebar,.xw,#calBody," +
    ".lb-name,#word,.picks,.card u,#log,#people,.ttl,.by,.cmt-body,[data-noxlate],.fb-count,.chat-msg,.chat-log li:not(.chat-sys),.entry,.gb-entry,.msg-body";

  var origText = new WeakMap();   // text node -> original string
  var origAttr = new WeakMap();   // element -> { attr: original }
  var ATTRS = ["title", "placeholder", "aria-label", "alt"];
  var busy = false;

  // (panic mode's fake Office / OneDrive pages are left alone too)
  // the forum is people's posts: only its bar and footer get translated
  var CHROME_ONLY = /forum\.html$/.test(location.pathname) ? ".homebar,.sitefoot,.fb-root,.sfc-dock,.sfc-pop,.sfc-toast" : null;
  function skipped(el) {
    return !el || root.classList.contains("panic") || (el.closest && (el.closest(SKIP) || (CHROME_ONLY && !el.closest(CHROME_ONLY))));
  }

  function xlate(str, el) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
    var core = m[2];
    var isScore = el && el.classList && el.classList.contains("lb-score"); // "1:23.45" has no letters but still gets the credit unit
    if (!core || (!isScore && !/[A-Za-z]/.test(core))) return null;
    var key = core.toLowerCase().replace(/\u2026/g, "...").replace(/\s+/g, " ");
    var hit = D[key], pre = "", post = "";
    if (hit === undefined) hit = ruleXlate(key, el);
    if (hit == null) {
      // a star or an arrow stuck on the front or back ("Featured Game" with a star): peel the little symbols off both ends and try again
      var p = /^([\s\u2190-\u2bff\u00ab\u00bb\u25b6\u2605\u2726]*)(.*?)([\s\u2190-\u2bff\u00ab\u00bb\u25b6\u2605\u2726]*)$/.exec(key);
      if (p && (p[1] || p[3]) && p[2]) {
        hit = D[p[2]];
        if (hit !== undefined) { var o = /^([\s\u2190-\u2bff\u00ab\u00bb\u25b6\u2605\u2726]*)/.exec(core)[1]; pre = o; post = core.slice(core.length - p[3].length); if (!p[3]) post = ""; }
      }
    }
    if (hit == null) return null;
    return m[1] + pre + hit + post + m[3];
  }

  function doText(node) {
    var el = node.parentElement;
    if (skipped(el)) return;
    if (origText.has(node)) {
      // already translated (or seen): only re-translate if the page wrote new text into it
      if (node.nodeValue === origText.get(node).zh) return;
      origText.delete(node);
    }
    var out = xlate(node.nodeValue, el);
    if (out == null) return;
    origText.set(node, { en: node.nodeValue, zh: out });
    node.nodeValue = out;
  }

  function doAttrs(el) {
    if (skipped(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var rec = origAttr.get(el) || {};
      var cur = el.getAttribute(a);
      if (rec[a] && rec[a].zh === cur) continue;
      var out = xlate(cur, el);
      if (out == null) continue;
      rec[a] = { en: cur, zh: out };
      origAttr.set(el, rec);
      el.setAttribute(a, out);
    }
  }

  function walk(rootEl) {
    if (!rootEl) return;
    if (rootEl.nodeType === 3) { doText(rootEl); return; }
    if (rootEl.nodeType !== 1) return;
    if (skipped(rootEl)) return;
    doAttrs(rootEl);
    var w = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1 && skipped(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) doText(n); else doAttrs(n);
    }
  }

  // put every node and attribute back to English
  var seenNodes = []; // text nodes we touched (WeakMap isn't iterable)
  function restoreAll() {
    var w = document.createTreeWalker(document.body || root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      var rec = origText.get(n);
      if (rec && n.nodeValue === rec.zh) n.nodeValue = rec.en;
      if (rec) origText.delete(n);
    }
    var els = document.querySelectorAll("[title],[placeholder],[aria-label],[alt]");
    for (var i = 0; i < els.length; i++) {
      var r = origAttr.get(els[i]);
      if (!r) continue;
      for (var a in r) if (els[i].getAttribute(a) === r[a].zh) els[i].setAttribute(a, r[a].en);
      origAttr.delete(els[i]);
    }
  }

  var enTitle = null;
  function doTitle() {
    if (enTitle == null) enTitle = document.title;
    if (!on) { if (enTitle != null) document.title = enTitle; return; }
    var out = xlate(enTitle, null);
    if (out) document.title = out;
  }

  var obs = null;
  function startObserver() {
    if (obs || !window.MutationObserver || !document.body) return;
    obs = new MutationObserver(function (muts) {
      if (!on) return;
      obs.disconnect();
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
      obs.observe(document.body, OBS_OPTS);
    });
    obs.observe(document.body, OBS_OPTS);
  }
  var OBS_OPTS = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  function stopObserver() { if (obs) { obs.disconnect(); obs = null; } }

  // ---------------------------------------------------------------
  // the look: red and gold, coins and lanterns, the guy's outfit
  // ---------------------------------------------------------------
  var TILE = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>" +
    "<g fill='none' stroke='#ffd23f' stroke-opacity='.3' stroke-width='2'>" +
    "<circle cx='30' cy='30' r='14'/><rect x='24' y='24' width='12' height='12'/>" +
    "<circle cx='90' cy='90' r='14'/><rect x='84' y='84' width='12' height='12'/></g>" +
    "<g fill='#ffd23f' fill-opacity='.22' font-size='22' text-anchor='middle' font-family='KaiTi,STKaiti,serif'>" +
    "<text x='90' y='38'>福</text><text x='30' y='98'>喜</text></g></svg>";
  var LANTERN = "<svg viewBox='0 0 60 120' aria-hidden='true'>" +
    "<path d='M30 0v14' stroke='#7d0a12' stroke-width='3'/>" +
    "<rect x='16' y='12' width='28' height='7' rx='2' fill='#ffd23f' stroke='#1d1b2e' stroke-width='2.5'/>" +
    "<ellipse cx='30' cy='46' rx='26' ry='28' fill='#e01b24' stroke='#1d1b2e' stroke-width='3'/>" +
    "<path d='M30 18v56M16 22q-10 24 0 48M44 22q10 24 0 48' fill='none' stroke='#ff7b7b' stroke-width='1.6' opacity='.7'/>" +
    "<text x='30' y='55' text-anchor='middle' font-size='26' font-weight='700' fill='#ffd23f' font-family='KaiTi,STKaiti,serif'>福</text>" +
    "<rect x='16' y='72' width='28' height='7' rx='2' fill='#ffd23f' stroke='#1d1b2e' stroke-width='2.5'/>" +
    "<path d='M24 79v22M30 79v28M36 79v22' stroke='#ffd23f' stroke-width='3' stroke-linecap='round'/></svg>";

  function css() {
    var tile = "url(\"data:image/svg+xml," + encodeURIComponent(TILE) + "\")";
    return [
      ".zh-outfit{display:none}html.zh .zh-outfit{display:inline}",
      ".zh-btn{all:unset;box-sizing:border-box;cursor:pointer;flex:none;order:8;height:36px;padding:0 12px;display:inline-flex;align-items:center;",
      "font:700 15px/1 'Lilita One','Microsoft YaHei','PingFang SC',sans-serif;color:#ffd23f;background:#d4141c;border:3px solid #1d1b2e;border-radius:10px;",
      "box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),inset 0 3px 0 rgba(255,255,255,.3);transition:transform .08s;white-space:nowrap}",
      ".zh-btn:hover{transform:translateY(-2px)}.zh-btn:active{transform:translateY(1px)}.zh-btn:focus-visible{outline:3px solid #fff;outline-offset:1px}",
      "html.zh .zh-btn{background:#ffd23f;color:#b5121b}",
      "@media (max-width:560px){.homebar .zh-btn{position:absolute;top:10px;right:92px}}",
      // palette: vermilion, deep red, gold, jade
      "html.zh:not(.panic){--sky:#b5121b;--sky-dk:#7d0a12;--sun:#ffd23f;--soft:#fff3e0;--word:#d62828;--puzzle:#9d0208;--skill:#0f8a5f;--online:#c9971c;--art:#e85d04;--hang:#6a040f;--accent:#d62828;--accent2:#e85d04;--good:#0f8a5f}",
      "html.zh:not(.panic) body{background-color:#b5121b;background-image:" + tile + ",linear-gradient(180deg,#e01b24 0,#b5121b 420px,#8c0d15 100%);background-size:120px 120px,100% 100%;background-repeat:repeat,no-repeat}",
      "html.zh:not(.panic) body.k-word,html.zh:not(.panic) body.k-puzzle,html.zh:not(.panic) body.k-skill,html.zh:not(.panic) body.k-art,html.zh:not(.panic) body.k-hang,html.zh:not(.panic) body.k-base,html.zh:not(.panic) body.k-online{--accent:#d62828;--accent2:#e85d04}",
      "html.zh:not(.panic) .nav,html.zh:not(.panic) .homebar{background:linear-gradient(#e01b24,#a50d16);border-color:#1d1b2e;box-shadow:0 5px 0 #1d1b2e,0 0 0 3px #ffd23f}",
      "html.zh:not(.panic) .nav a,html.zh:not(.panic) .hb-nav a{background:#7d0a12!important;color:#ffd23f!important;text-shadow:0 2px 0 rgba(0,0,0,.4)}",
      "html.zh:not(.panic) .wrap{border-color:#7d0a12;box-shadow:0 6px 0 rgba(0,0,0,.35),0 0 0 3px #ffd23f}",
      "html.zh:not(.panic) .hb-logo,html.zh:not(.panic) .logo h1{color:#ffd23f}",
      "html.zh:not(.panic) .counter{background:#2b0508;color:#ffd23f;border-color:#ffd23f}html.zh:not(.panic) .counter b{color:#ffd23f;text-shadow:0 0 6px rgba(255,210,63,.6)}",
      "html.zh:not(.panic) .slogan{color:#ffe9a8}",
      "html.zh:not(.panic) body::before{content:'';position:absolute;top:0;left:0;right:0;height:7px;z-index:5;pointer-events:none;background:repeating-linear-gradient(90deg,#ffd23f 0 16px,#d4141c 16px 32px)}",
      "html.zh:not(.panic) body{position:relative}",
      // the logo becomes 有点烦 with its pinyin underneath
      "html.zh:not(.panic) .logo h1 > span:not(.alpha){display:none}",
      "html.zh:not(.panic) .logo h1::before{content:'有点烦';font-family:'KaiTi','STKaiti','Kaiti SC','Microsoft YaHei','PingFang SC',sans-serif;font-weight:900;letter-spacing:4px;display:inline-block}",
      "html.zh:not(.panic) .logo h1{position:relative}",
      "html.zh:not(.panic) .logo h1::after{content:'yǒu diǎn fán';position:absolute;left:6px;bottom:-14px;font:700 15px/1 Arial,'Segoe UI','Helvetica Neue',sans-serif;letter-spacing:1px;color:#fff;-webkit-text-stroke:0;paint-order:normal;text-shadow:0 2px 0 #1d1b2e}",
      "html.zh:not(.panic) .logo{padding-bottom:14px}",
      // the guy in his robe
      "html.zh:not(.panic) .mascot,html.zh:not(.panic) .fb-done svg{overflow:visible}",
      // lanterns hanging from the top corners
      ".zh-lanterns{display:none}",
      "html.zh:not(.panic) .zh-lanterns{display:block}",
      ".zh-lantern{position:absolute;top:6px;width:54px;pointer-events:none;z-index:6;transform-origin:50% 0;animation:zh-swing 3.4s ease-in-out infinite alternate}",
      ".zh-lantern.l{left:max(8px,calc(50% - 560px))}.zh-lantern.r{right:max(8px,calc(50% - 560px));animation-delay:-1.7s}",
      ".zh-lantern svg{display:block;width:100%;height:auto;filter:drop-shadow(0 3px 0 rgba(0,0,0,.25))}",
      "@keyframes zh-swing{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}",
      "@media (prefers-reduced-motion:reduce){.zh-lantern{animation:none}}",
      "@media (max-width:1119px){.zh-lanterns{display:none!important}}",
      "@media (max-width:560px){.zh-lanterns{display:none!important}}",
      // scoreboards: gold, and the panel head says it in the chunky face
      "html.zh:not(.panic) .lb-head b{color:#b5121b}html.zh:not(.panic) .lb .lb-score{color:#b5121b}",
    ].join("\n");
  }

  var style = null, lanterns = null;
  function injectStyle() {
    if (style) return;
    style = document.createElement("style");
    style.id = "zh-style";
    style.textContent = css() + "\n" + portalCss();
    (document.head || root).appendChild(style);
  }
  function addLanterns() {
    if (lanterns || !document.body) return;
    lanterns = document.createElement("div");
    lanterns.className = "zh-lanterns";
    lanterns.setAttribute("aria-hidden", "true");
    lanterns.setAttribute("data-nosfx", "");
    lanterns.innerHTML = "<div class='zh-lantern l'>" + LANTERN + "</div><div class='zh-lantern r'>" + LANTERN + "</div>";
    document.body.appendChild(lanterns);
  }

  // ---------------------------------------------------------------
  // the guy's outfit: a red changshan robe with a gold collar and frog knots,
  // and a black futou hat with the two flat wings (a scholar-official's cap).
  // Drawn on the 62x70 logo guy; every part is class "zh-outfit", so it only
  // shows under html.zh. arm = "wave" (logo) or "thumb" (the thanks card)
  // ---------------------------------------------------------------
  function outfit(arm) {
    var ink = "#1d1b2e", red = "#d4141c", gold = "#ffd23f";
    function sleeve(d, cls) {
      return "<g class='zh-outfit" + (cls ? " " + cls : "") + "' fill='none' stroke-linecap='round' stroke-linejoin='round'>" +
        "<path d='" + d + "' stroke='" + ink + "' stroke-width='10.5'/><path d='" + d + "' stroke='" + red + "' stroke-width='7'/></g>";
    }
    var g = "<path class='zh-outfit' d='M21 27Q30 22 39 27L44 61Q30 64 16 61Z' fill='" + red + "' stroke='" + ink + "' stroke-width='2.5'/>" +
      "<path class='zh-outfit' d='M16.6 58Q30 61 43.4 58' fill='none' stroke='" + gold + "' stroke-width='2.4'/>" +
      sleeve("M30 30l-12 10") +
      (arm === "thumb" ? sleeve("M30 30l14-8") : sleeve("M30 30l14-12", "arm")) +
      "<path class='zh-outfit' d='M30 30V59' fill='none' stroke='" + gold + "' stroke-width='1.6'/>" +
      "<g class='zh-outfit' fill='" + gold + "' stroke='" + ink + "' stroke-width='1'><circle cx='30' cy='36' r='1.9'/><circle cx='30' cy='43' r='1.9'/><circle cx='30' cy='50' r='1.9'/></g>" +
      "<rect class='zh-outfit' x='26' y='22' width='8' height='4.5' rx='1' fill='" + gold + "' stroke='" + ink + "' stroke-width='1.5'/>" +
      "<g class='zh-outfit' fill='" + ink + "' stroke='none'><rect x='6' y='3' width='19' height='3.4' rx='1.4'/><rect x='35' y='3' width='19' height='3.4' rx='1.4'/></g>" +
      "<path class='zh-outfit' d='M20.5 8.5Q20.5 -2 30 -2Q39.5 -2 39.5 8.5Z' fill='" + ink + "' stroke='" + ink + "' stroke-width='2'/>" +
      "<path class='zh-outfit' d='M21 7H39' fill='none' stroke='" + gold + "' stroke-width='1.8'/>";
    return g;
  }
  function dressMascots() {
    var m = document.querySelectorAll("svg.mascot");
    for (var i = 0; i < m.length; i++) {
      if (m[i].querySelector(".zh-outfit")) continue;
      try { m[i].insertAdjacentHTML("beforeend", outfit("wave")); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------
  // the button
  // ---------------------------------------------------------------
  var btn = null;
  function drawButton() {
    if (!btn) return;
    btn.textContent = on ? "English" : "中文";
    btn.title = on ? "switch back to English (切换到英文)" : "switch the whole site to Chinese (切换到中文)";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.lang = on ? "en" : "zh";
  }
  function injectButton() {
    if (btn || document.querySelector(".zh-btn")) return;
    var host = document.querySelector(".homebar") || document.querySelector("nav.nav");
    if (!host) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zh-btn";
    btn.setAttribute("data-nosfx", "");
    btn.setAttribute("data-noxlate", ""); // ("English" is also a typing test word in the dictionary)
    // (blur: Space / Enter in a game must not press this button again)
    btn.addEventListener("click", function () { set(!on, true); btn.blur(); });
    // warm the YouTube player up as the pointer arrives, so the song starts the instant it's clicked
    btn.addEventListener("pointerenter", function () { if (!on) ytLoad(); }, { once: true });
    var sfxBox = host.querySelector(".sfx-box");
    if (sfxBox) host.insertBefore(btn, sfxBox); else host.appendChild(btn);
    drawButton();
  }

  // ---------------------------------------------------------------
  // on / off
  // ---------------------------------------------------------------
  function music(name) {
    try { if (window.SortafunSFX && SortafunSFX.theme) SortafunSFX.theme(name); } catch (e) {}
  }
  function apply() {
    root.classList.toggle("zh", on);
    root.lang = on ? "zh-CN" : "en";
    drawButton();
    if (on) {
      if (document.body) { walk(document.body); startObserver(); }
    } else {
      stopObserver();
      if (document.body) restoreAll();
    }
    doTitle();
    music(on ? "zh" : "en");
    try { window.dispatchEvent(new CustomEvent("sortafun-zh", { detail: { on: on } })); } catch (e) {}
  }
  function set(v, fromClick) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
    apply();
    if (fromClick && window.SortafunSFX) {
      SortafunSFX.play(on ? "gong" : "back");
      // turning Chinese on starts the music (it was a click, so the browser allows it)
      if (on && SortafunSFX.music && !SortafunSFX.music.playing()) SortafunSFX.music.start();
    }
  }

  // ---------------------------------------------------------------
  // the music: in Chinese mode the note button plays 弥渡山歌 (Midu Echoing) from
  // YouTube's own embedded player (nothing is hosted here). sfx.js asks this object
  // whether to take over; if YouTube is blocked or errors, the 8-bit tune plays instead
  // ---------------------------------------------------------------
  var YT_ID = "GYwVZ1ium3k", YT_POS = "sortafun-yt-pos";
  var yt = { player: null, ready: false, dead: false, loading: false, want: false, level: 0.5 };
  var ytArmed = false;
  function ytVol() { return Math.round(Math.min(1, yt.level * 1.4) * 80); }
  function ytSavedPos() {
    try {
      var p = JSON.parse(sessionStorage.getItem(YT_POS) || "null");
      if (p && Date.now() - p.at < 10 * 60 * 1000) return Math.max(0, Math.floor(p.t + (Date.now() - p.at) / 1000));
    } catch (e) {}
    return 0;
  }
  function ytSavePos() {
    try {
      if (yt.player && yt.ready && yt.want) sessionStorage.setItem(YT_POS, JSON.stringify({ t: yt.player.getCurrentTime(), at: Date.now() }));
    } catch (e) {}
  }
  function ytFail() {
    yt.dead = true;
    if (window.SortafunSFX && SortafunSFX.extFailed) SortafunSFX.extFailed();
  }
  // autoplay can be refused on a fresh page: the next click or key press starts it
  function ytArm() {
    if (ytArmed) return;
    ytArmed = true;
    var go = function () {
      ytArmed = false;
      window.removeEventListener("pointerdown", go, true);
      window.removeEventListener("keydown", go, true);
      if (yt.want && yt.player) try { yt.player.playVideo(); } catch (e) {}
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
  }
  function ytPlay() {
    if (!yt.player || !yt.ready) return;
    try { yt.player.setVolume(ytVol()); yt.player.unMute(); yt.player.playVideo(); } catch (e) {}
    setTimeout(function () {
      if (!yt.want || !yt.player) return;
      var st = -1;
      try { st = yt.player.getPlayerState(); } catch (e) {}
      if (st !== 1 && st !== 3) ytArm();
    }, 2500);
  }
  function ytLoad() {
    if (yt.loading || yt.dead) return;
    yt.loading = true;
    var wrap = document.createElement("div");
    wrap.id = "zh-ytwrap";
    wrap.setAttribute("aria-hidden", "true");
    wrap.setAttribute("data-noxlate", "");
    wrap.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;height:200px;overflow:hidden;pointer-events:none";
    wrap.innerHTML = '<div id="zh-yt"></div>';
    (document.body || root).appendChild(wrap);
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === "function") { try { prev(); } catch (e) {} }
      try {
        var vars = { autoplay: 0, controls: 0, playsinline: 1, rel: 0, loop: 1, playlist: YT_ID, start: ytSavedPos() };
        if (/^https?:/.test(location.origin)) vars.origin = location.origin;
        yt.player = new YT.Player("zh-yt", {
          videoId: YT_ID, width: 200, height: 200, playerVars: vars,
          events: {
            onReady: function () { yt.ready = true; if (yt.want) ytPlay(); },
            onStateChange: function (e) { if (e.data === 0) { try { yt.player.seekTo(0); yt.player.playVideo(); } catch (x) {} } },
            onError: function () { ytFail(); }
          }
        });
      } catch (e) { ytFail(); }
    };
    var sc = document.createElement("script");
    sc.src = "https://www.youtube.com/iframe_api";
    sc.onerror = ytFail;
    document.head.appendChild(sc);
  }
  var ytExt = {
    ok: function () { return on && !yt.dead; },
    start: function (level) {
      yt.want = true;
      if (level != null) yt.level = level;
      ytLoad();
      if (yt.ready) ytPlay();
      setTimeout(function () { if (yt.want && !yt.ready) ytFail(); }, 9000); // never loaded: use the 8-bit tune
    },
    stop: function () {
      ytSavePos();
      yt.want = false;
      try { if (yt.player && yt.ready) yt.player.pauseVideo(); } catch (e) {}
    },
    level: function (l) {
      yt.level = l;
      try { if (yt.player && yt.ready) yt.player.setVolume(ytVol()); } catch (e) {}
    }
  };
  if (window.SortafunSFX && SortafunSFX.external) SortafunSFX.external(ytExt);
  window.addEventListener("pagehide", ytSavePos);

  // ---------------------------------------------------------------
  // a Chinese web portal: dense, loud and cluttered, like a 4399-style games site.
  // Everything here is hidden unless <html class="zh"> (see portalCss); all of it is
  // decoration (the login boxes are disabled, the side ads only close)
  // ---------------------------------------------------------------
  var MAO = "<svg class='zh-mao' viewBox='0 0 80 90' role='img' aria-label='cartoon portrait'>" +
    "<rect x='2' y='2' width='76' height='86' rx='6' fill='#ffd23f' stroke='#1d1b2e' stroke-width='3'/>" +
    "<rect x='7' y='7' width='66' height='76' rx='3' fill='#d4141c'/>" +
    "<path d='M22 11l2.2 5 5.3.5-4 3.6 1.2 5.3-4.7-2.8-4.7 2.8 1.2-5.3-4-3.6 5.3-.5z' fill='#ffd23f' transform='translate(-4 -3) scale(.9)'/>" +
    "<path d='M9 83L11 71Q22 63 33 62L40 70L47 62Q58 63 69 71L71 83Z' fill='#6f7c5e' stroke='#1d1b2e' stroke-width='2.5' stroke-linejoin='round'/>" +
    "<path d='M32 60L40 72L35 77L27 65Z M48 60L40 72L45 77L53 65Z' fill='#8a977a' stroke='#1d1b2e' stroke-width='2' stroke-linejoin='round'/>" +
    "<rect x='34' y='52' width='12' height='11' fill='#f1c79a' stroke='#1d1b2e' stroke-width='2'/>" +
    "<ellipse cx='22.5' cy='40' rx='3' ry='5' fill='#f1c79a' stroke='#1d1b2e' stroke-width='2'/><ellipse cx='57.5' cy='40' rx='3' ry='5' fill='#f1c79a' stroke='#1d1b2e' stroke-width='2'/>" +
    "<ellipse cx='40' cy='37' rx='18' ry='21' fill='#f6d3aa' stroke='#1d1b2e' stroke-width='2.5'/>" +
    "<path d='M21.5 35Q19 12 40 13Q61 12 58.5 35Q55 23 40 23Q25 23 21.5 35Z' fill='#1d1b2e'/>" +
    "<path d='M29 32l8-1.5M43 30.5l8 1.5' stroke='#1d1b2e' stroke-width='2' stroke-linecap='round'/>" +
    "<circle cx='33' cy='37' r='1.9' fill='#1d1b2e'/><circle cx='47' cy='37' r='1.9' fill='#1d1b2e'/>" +
    "<path d='M40 38v6l-2 1.5' fill='none' stroke='#b9855a' stroke-width='1.6' stroke-linecap='round'/>" +
    "<circle cx='30' cy='45' r='3' fill='#f2a58f' opacity='.55'/><circle cx='50' cy='45' r='3' fill='#f2a58f' opacity='.55'/>" +
    "<path d='M33.5 49.5Q40 55 46.5 49.5' fill='none' stroke='#1d1b2e' stroke-width='2' stroke-linecap='round'/>" +
    "<circle cx='41.5' cy='55' r='1.2' fill='#8a4b2a'/></svg>";

  function zhName(g) { return D[String(g.name).toLowerCase()] || g.name; }
  function listGames() {
    var a = [];
    try { a = (window.GAMES || []).concat(window.ART || [], window.HANGOUT || []); } catch (e) {}
    return a.filter(function (g) { return g && g.url; });
  }

  function bannerHtml() {
    return "<div class='zh-b-mao'>" + MAO + "</div>" +
      "<div class='zh-b-mid'><div class='zh-b-title'><span>I</span><span class='h'>♥</span><span>BJ</span></div>" +
      "<div class='zh-b-sub'>我爱北京天安门 · 北京欢迎你</div></div>" +
      "<div class='zh-b-right'><div class='zh-b-stars'>★★★★★</div>" +
      "<div class='zh-np'>♪ 弥渡山歌 Midu Echoing</div>" +
      "<div class='zh-b-tag'>欢迎光临 · 永久免费</div></div>";
  }
  function utilHtml() {
    return "<span class='zh-u-l'><b>欢迎来到有点烦！</b> <i>设为首页</i>|<i>加入收藏</i>|<i>手机版</i>|<i>联系客服</i>|<i>客服QQ：88888888</i></span>" +
      "<span class='zh-u-r' title='只是装饰，不能登录'>用户名 <input disabled size='8'> 密码 <input disabled type='password' size='8'> " +
      "<button type='button' disabled>登录</button> <i>注册</i> <i>忘记密码</i></span>";
  }

  var VARIANTS = ["", "2", "无敌版", "在线玩", "双人版", "中文版", "HD", "最新版", "小游戏", "修改版", "全集", "攻略"];
  function linkRow(pool, n, seed) {
    var h = "";
    if (!pool.length) return h;
    for (var i = 0; i < n; i++) {
      var g = pool[(i + seed) % pool.length], v = VARIANTS[Math.floor((i + seed) / pool.length) % VARIANTS.length];
      var t = zhName(g) + v;
      var cls = i % 5 === 2 ? " class='r'" : i % 7 === 3 ? " class='o'" : "";
      h += "<a href='" + g.url + "'" + cls + ">" + t + "</a>" + (i % 7 === 3 ? "<em class='zh-new'>NEW</em>" : "");
    }
    return h;
  }
  function portalHtml(all) {
    var by = function (cats) { return all.filter(function (g) { return cats.indexOf(g.cat) >= 0; }); };
    var rows = [
      ["专辑", "#d4141c", all, 0], ["文字", "#e85d04", by(["word"]), 1], ["解谜", "#9d0208", by(["puzzle"]), 2],
      ["技巧", "#0f8a5f", by(["skill"]), 3], ["联机", "#c9971c", by(["online"]), 4], ["艺术", "#6a040f", by(["art", "hang"]), 5]
    ];
    var h = "<div class='zh-hot'><b>热门搜索：</b>";
    all.slice(0, 9).forEach(function (g, i) { h += "<a href='" + g.url + "'" + (i % 3 === 0 ? " class='r'" : "") + ">" + zhName(g) + "</a>"; });
    h += "<span class='zh-hot-r'><i>登录</i> <i>注册</i> <i>忘记密码</i></span></div>";
    h += "<div class='zh-marq'><span><b>【公告】</b>欢迎来到有点烦！本站所有游戏永久免费！ 【活动】每日新加坡时间零点社会信用榜刷新 【新游】深度时间 第二部已上线 【提示】适度游戏益脑，沉迷游戏伤身。 【下载】无需下载，点开即玩！</span></div>";
    h += "<div class='zh-cats'>";
    rows.forEach(function (r) {
      h += "<div class='zh-cat'><b style='background:" + r[1] + "'>" + r[0] + "</b><div class='zh-links'>" + linkRow(r[2], 14, r[3] * 3) + "</div><span class='zh-more'>更多&gt;&gt;</span></div>";
    });
    h += "</div><div class='zh-icons'>";
    var withThumb = typeof window.thumb === "function";
    all.slice(0, 20).forEach(function (g, i) {
      h += "<a href='" + g.url + "'><span class='zh-ic'>" + (withThumb ? window.thumb(g.id) : "") + "</span><span class='zh-icn'>" + zhName(g) + (i % 4 === 1 ? "2" : "") + "</span></a>";
    });
    h += "</div>";
    return h;
  }
  function footHtml(all) {
    var h = "<div class='zh-f-links'><b>友情链接：</b>";
    all.forEach(function (g) { h += "<a href='" + g.url + "'>" + zhName(g) + "</a>"; });
    h += "</div><div class='zh-f-links'><i>关于我们</i>|<i>联系我们</i>|<i>广告服务</i>|<i>招聘人才</i>|<i>帮助中心</i>|<i>版权声明</i>|<i>隐私政策</i>|<i>网站地图</i></div>" +
      "<div class='zh-f-warn'>健康游戏忠告：抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。</div>" +
      "<div class='zh-f-icp'>京 ICP 备 88888888 号 · 京公网安备 88888888 号 · Copyright © 2026 有点烦 All Rights Reserved. · 不是真的备案号，只是玩笑</div>";
    return h;
  }
  function floatHtml(side) {
    return "<button type='button' class='zh-x' aria-label='close'>×</button><div class='zh-fl-t'>" + (side === "l" ? "新手礼包" : "客服在线") + "</div>" +
      "<div class='zh-fl-b'>" + (side === "l" ? "点击领取<br>永久免费" : "QQ：<br>88888888") + "</div><div class='zh-fl-s'>★ HOT ★</div>";
  }

  var portalBuilt = false;
  function buildPortal() {
    if (portalBuilt || !document.body) return;
    portalBuilt = true;
    var all = listGames();
    var b = document.createElement("div");
    b.className = "zh-banner"; b.setAttribute("data-noxlate", ""); b.innerHTML = bannerHtml();
    var u = document.createElement("div");
    u.className = "zh-util"; u.setAttribute("data-noxlate", ""); u.innerHTML = utilHtml();
    document.body.insertBefore(u, document.body.firstChild);
    document.body.insertBefore(b, document.body.firstChild);
    var home = document.getElementById("gamegrid");
    if (home) {
      root.classList.add("zh-home");
      var nav = document.querySelector("nav.nav");
      var p = document.createElement("div");
      p.className = "zh-portal"; p.setAttribute("data-noxlate", ""); p.innerHTML = portalHtml(all);
      if (nav && nav.parentNode) nav.parentNode.insertBefore(p, nav.nextSibling);
    }
    var f = document.createElement("div");
    f.className = "zh-foot"; f.setAttribute("data-noxlate", ""); f.innerHTML = footHtml(all);
    document.body.appendChild(f);
    ["l", "r"].forEach(function (s) {
      var d = document.createElement("div");
      d.className = "zh-float " + s; d.setAttribute("data-noxlate", ""); d.innerHTML = floatHtml(s);
      d.querySelector(".zh-x").addEventListener("click", function () { d.style.display = "none"; });
      document.body.appendChild(d);
    });
  }

  function portalCss() {
    var Z = "html.zh:not(.panic) ", H = "html.zh.zh-home:not(.panic) ";
    var star = "url(\"data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46'><path d='M23 8l3.2 7.4 8 .7-6 5.3 1.8 7.9-7-4.2-7 4.2 1.8-7.9-6-5.3 8-.7z' fill='#ffd23f' fill-opacity='.22'/></svg>") + "\")";
    return [
      ".zh-banner,.zh-util,.zh-portal,.zh-foot,.zh-float{display:none}",
      Z + ".zh-banner{display:flex;align-items:center;gap:14px;padding:6px 16px;background:" + star + ",linear-gradient(#e8222b,#a50d16);border-bottom:3px solid #ffd23f;position:relative;z-index:6;color:#ffd23f}",
      ".zh-mao{width:58px;height:65px;display:block;transform:rotate(-3deg);filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}",
      ".zh-b-mid{flex:1;text-align:center;min-width:0}",
      ".zh-b-title{font:400 46px/1 'Lilita One','Arial Black',sans-serif;color:#fff;-webkit-text-stroke:3px #7d0a12;paint-order:stroke fill;text-shadow:0 4px 0 #7d0a12;letter-spacing:3px}",
      ".zh-b-title .h{color:#ffd23f;display:inline-block;margin:0 .15em;animation:zh-beat 1s ease-in-out infinite}",
      "@keyframes zh-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}",
      ".zh-b-sub{font-size:13px;font-weight:700;color:#ffe9a8;letter-spacing:2px}",
      ".zh-b-right{text-align:right;font-size:12px;line-height:1.5;white-space:nowrap}",
      ".zh-b-stars{font-size:16px;letter-spacing:3px;animation:zh-blink 1.2s steps(2,start) infinite}",
      "@keyframes zh-blink{50%{opacity:.35}}",
      ".zh-np{background:#7d0a12;border:2px solid #ffd23f;border-radius:12px;padding:1px 10px;color:#fff;font-weight:700}",
      ".zh-b-tag{color:#ffe9a8}",
      "@media (max-width:640px){.zh-b-right{display:none}.zh-b-title{font-size:32px}.zh-mao{width:44px;height:50px}.zh-b-sub{font-size:11px}}",
      Z + ".zh-util{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 10px;padding:3px 14px;background:#fff3d6;border-bottom:1px solid #e8b44c;font:12px/1.6 'Microsoft YaHei','PingFang SC',Verdana,sans-serif;color:#7a5200}",
      ".zh-util i,.zh-portal i,.zh-foot i{font-style:normal;cursor:default;color:#1a3d8f;margin:0 5px}.zh-util b{color:#d4141c;margin-right:6px}",
      ".zh-util input{width:74px;height:16px;font-size:11px;border:1px solid #c9a24d;background:#fff}.zh-util button{font-size:11px;padding:0 6px}",
      Z + ".zh-portal{display:block;max-width:1000px;margin:8px auto 0;border:2px solid #e8b44c;background:#fffdf5;font:12px/1.5 'Microsoft YaHei','PingFang SC',Verdana,sans-serif}",
      ".zh-portal a{color:#1a3d8f;text-decoration:none;margin:0 6px;white-space:nowrap}.zh-portal a:hover{color:#d4141c;text-decoration:underline}",
      ".zh-portal a.r,.zh-links a.r{color:#d4141c;font-weight:700}.zh-portal a.o{color:#e85d04;font-weight:700}",
      ".zh-hot{display:flex;flex-wrap:wrap;align-items:center;padding:4px 8px;background:#fff0c2;border-bottom:1px solid #e8b44c}.zh-hot b{color:#d4141c}.zh-hot-r{margin-left:auto}",
      ".zh-marq{overflow:hidden;white-space:nowrap;padding:3px 0;background:#fff;border-bottom:1px solid #f0d9a0;color:#d4141c}",
      ".zh-marq span{display:inline-block;padding-left:100%;animation:zh-run 28s linear infinite}.zh-marq b{color:#e85d04}",
      "@keyframes zh-run{to{transform:translateX(-100%)}}",
      ".zh-cat{display:flex;align-items:flex-start;gap:6px;padding:4px 8px;border-bottom:1px dashed #f0d9a0}.zh-cat:nth-child(odd){background:#fff8e6}",
      ".zh-cat>b{flex:none;width:42px;text-align:center;color:#fff;font-size:12px;padding:1px 0;border-radius:2px}",
      ".zh-links{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;line-height:1.7}.zh-more{flex:none;color:#888;font-size:11px}",
      ".zh-new{font:700 9px/1 Arial,sans-serif;color:#fff;background:#d4141c;border-radius:2px;padding:1px 3px;font-style:normal;margin-left:-3px;animation:zh-blink .9s steps(2,start) infinite}",
      ".zh-icons{display:grid;grid-template-columns:repeat(10,1fr);gap:6px 4px;padding:8px}",
      ".zh-icons a{display:flex;flex-direction:column;align-items:center;margin:0;text-align:center;min-width:0}",
      ".zh-ic{display:block;width:100%;max-width:74px;aspect-ratio:4/3;border:1px solid #c9a24d;border-radius:4px;overflow:hidden;background:#fff}.zh-ic svg{display:block;width:100%;height:100%}",
      ".zh-icn{display:block;margin-top:2px;font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis}",
      "@media (max-width:760px){.zh-icons{grid-template-columns:repeat(5,1fr)}.zh-cat>b{width:34px}}",
      Z + ".zh-foot{display:block;margin:14px 0 0;padding:10px 14px 18px;background:#7d0a12;border-top:3px solid #ffd23f;color:#ffe9a8;font:12px/1.9 'Microsoft YaHei','PingFang SC',Verdana,sans-serif;text-align:center}",
      ".zh-foot a{color:#ffd23f;margin:0 6px;text-decoration:none}.zh-foot a:hover{text-decoration:underline}.zh-foot i{color:#ffd23f}.zh-f-warn{color:#fff;opacity:.9;margin-top:4px}.zh-f-icp{font-size:11px;opacity:.8}",
      Z + ".zh-float{display:none;position:fixed;top:190px;width:92px;padding:6px 4px 8px;text-align:center;background:linear-gradient(#ffe9a8,#ffd23f);border:3px solid #d4141c;border-radius:6px;z-index:30;font:12px/1.4 'Microsoft YaHei','PingFang SC',sans-serif;color:#7d0a12;box-shadow:0 3px 0 rgba(0,0,0,.3)}",
      ".zh-float.l{left:6px}.zh-float.r{right:6px}.zh-fl-t{font-weight:900;font-size:14px;color:#d4141c}.zh-fl-b{margin:4px 0}.zh-fl-s{color:#d4141c;animation:zh-blink 1s steps(2,start) infinite;font-weight:700}",
      ".zh-x{all:unset;cursor:pointer;position:absolute;top:-2px;right:3px;font:700 16px/1 Arial,sans-serif;color:#7d0a12}",
      "@media (min-width:1320px){" + Z + ".zh-float{display:block}}",
      // lanterns hang below the banner now
      Z + ".zh-lantern{top:112px}",
      // the homepage: tighter and busier everywhere
      H + "body{font-size:12px}",
      H + ".site{padding:0 6px 24px}",
      H + ".top{padding:6px 4px;gap:8px}",
      H + ".slogan{font-size:14px}",
      H + ".panel{margin-top:6px;border-width:2px;border-radius:5px;box-shadow:none}",
      H + ".panel-head{padding:3px 8px}",
      H + ".panel-head h2{font-size:14px}",
      H + ".panel-head p{font-size:11px}",
      H + ".panel-body{padding:6px}",
      H + ".grid{grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:5px 4px}",
      H + ".tile{border-width:1px;border-radius:3px;box-shadow:none;padding:2px}",
      H + ".tile .name{font-size:11px;line-height:1.15}",
      H + ".feature-text{padding:8px 10px;gap:4px}.feature-text h3{font-size:22px}.feature-text p,.feature-text ul{font-size:11.5px}",
      H + ".ticker,.alphabar{margin-top:6px}",
      H + ".nav{padding:4px;gap:4px}.nav a{font-size:14px;padding:3px 10px 3px}",
    ].join("\n");
  }

  injectStyle();
  music(on ? "zh" : "en");

  function boot() {
    injectButton();
    addLanterns();
    dressMascots();
    buildPortal();
    try { if (on && localStorage.getItem("sortafun-music") === "1") ytLoad(); } catch (e) {}
    if (on) { walk(document.body); startObserver(); doTitle(); }
    root.lang = on ? "zh-CN" : "en";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  // a late load (images, a script that builds the page) can add text after DOMContentLoaded
  window.addEventListener("load", function () { if (on) walk(document.body); });

  window.SortafunZH = {
    on: function () { return on; },
    set: function (v) { set(v, false); },
    toggle: function () { set(!on, true); },
    outfit: outfit,
    song: function () { // test hook: where the YouTube player is (1 = playing, 3 = buffering)
      var st = null; try { st = yt.player && yt.ready ? yt.player.getPlayerState() : null; } catch (e) {}
      return { want: yt.want, ready: yt.ready, dead: yt.dead, state: st, vol: yt.ready ? yt.player.getVolume() : null };
    },
    dict: D,
    translate: function (s) { return xlate(s, null); },
  };
})();
