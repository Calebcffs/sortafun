#!/usr/bin/env python3
"""Search engines and link previews: one table (PAGES) for every page on the site.

    python tools/seo.py          (then tools/stamp.py, as always)

For each page it writes, between markers it owns:
  <head>  <!-- seo --> ... <!-- /seo -->   title, description, canonical,
          robots (noindex pages), Open Graph + Twitter card (link previews in
          WhatsApp / Discord / iMessage), JSON-LD (VideoGame + breadcrumbs on
          game pages, WebSite on the homepage), and sortafun:name (china.js
          uses it to translate the tab title)
  <body>  <!-- seo:about -->  "how to play" + questions, on the pages with an
          `about` below (static text: search engines read it, players skip it)
          <!-- seo:more -->   a "more games" strip of plain links
          homepage: <!-- seo:links --> every listed page as a plain link
and it rewrites sitemap.xml (indexable pages, lastmod from git) and robots.txt.

Rules:
  * EVERY .html page needs a row, or this fails (so a new page can never go
    out indexable by accident). A new game = a row here + its og image
    (node tools/og-images.mjs <id>).
  * Never put trademarked game names (the newspaper's daily word games, the
    boxed word-grid game, the big shooter series) in titles, descriptions,
    about text or share text: the repo is on GitHub, which takes down whole
    repos on a DMCA notice. Generic words only ("5-letter word game").
  * House voice: plain ASCII, no em / en dashes, no smart quotes, no ellipsis.
  * Old tags outside the markers (title, description, robots, og:*, twitter:*,
    canonical, theme-color) are removed, so the block is the only source.
  * Files are read and written byte for byte apart from the blocks (forum.html
    has a deliberate NUL byte in its password hashing).
"""
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SITE = "https://sortafun.org/"

# ---------------------------------------------------------------------------
# the table
#   name   the page's own short name, lowercase (china.js looks it up in D)
#   title  <= ~60 chars, keyword first, " | Sortafun" is added
#   desc   ~140-160 chars
#   og     id of the preview image (assets/og/<og>.png, from the homepage THUMB of that id)
#   kind   "game" (VideoGame JSON-LD + more-games strip), "page", "home"
#   index  False = noindex, kept out of the sitemap and the link lists
#   keep   (hidden pages) the tab title as raw HTML, unchanged from before seo.py
#   list   group for the homepage list / more-games strip: daily | word | puzzle | skill | online | art | hang
#   genre  for JSON-LD
#   daily  True = new content every day (sitemap changefreq daily)
# ---------------------------------------------------------------------------
PAGES = {
    "index.html": dict(name="sortafun", kind="home", og="home",
        title="Sortafun: Free Online Games and Daily Puzzles, No Downloads",
        desc="Free browser games with no downloads and no sign-up: daily sudoku, daily word puzzles, a typing test, minesweeper, a reaction test, racing, a shooter and more. Scores reset daily."),

    # --- daily puzzles
    "sudoku.html": dict(name="daily sudoku", kind="game", og="sudoku", list="daily", daily=True, genre=["Puzzle", "Sudoku"],
        title="Daily Sudoku: 3 Free Sudoku Puzzles Every Day",
        desc="Three new sudoku every day, easy, hard and extreme, the same for everyone. Free, no sign-up, works on your phone. Score on time and mistakes and climb today's live leaderboard."),
    "anagram.html": dict(name="word hive", kind="game", og="hive", list="daily", daily=True, genre=["Word game", "Puzzle"],
        title="Word Hive: Free Daily 7-Letter Word Puzzle",
        desc="Seven letters, one in the middle you must use. Find every word you can and climb the bee ranks. A new hive every day, free, no sign-up, with a live daily leaderboard."),
    "five.html": dict(name="five letters", kind="game", og="five", list="daily", daily=True, genre=["Word game", "Puzzle"],
        title="Five Letters: Daily 5-Letter Word Guessing Game",
        desc="Guess today's secret five letter word in six tries. Colours show which letters are in the word and in the right spot. One word a day for everyone, free, no sign-up."),
    "ladder.html": dict(name="word ladder", kind="game", og="ladder", list="daily", daily=True, genre=["Word game", "Puzzle"],
        title="Word Ladder: Free Daily Word Ladder Puzzle",
        desc="Change one letter at a time to get from the top word to the bottom one, every step a real four letter word. A new word ladder every day. Fewest rungs wins."),
    "sides.html": dict(name="four sides", kind="game", og="sides", list="daily", daily=True, genre=["Word game", "Puzzle"],
        title="Four Sides: Daily 12-Letter Word Chain Puzzle",
        desc="Twelve letters round a box. Chain words together, each starting with the last letter of the one before, until every letter is used. A new box every day. Fewest words wins."),
    "puzzle.html": dict(name="tile slider", kind="game", og="slider", list="daily", daily=True, genre=["Puzzle"],
        title="Tile Slider: Free Daily Sliding Tile Puzzle",
        desc="Slide the numbered tiles back into order in as few moves as you can. The same 3x3 scramble for everyone each day. Free sliding puzzle, keyboard or mouse."),
    "hive-archive.html": dict(name="word hive archive", kind="page", og="hive", list=None,
        title="Word Hive Archive: Play Past Daily Word Puzzles",
        desc="Missed a day? Play any word hive from the last year. Pick a date, find the words, and post your score to the all time board."),

    # --- word
    "grab.html": dict(name="word grab", kind="game", og="grab", list="word", daily=True, genre=["Word game"],
        title="Word Grab: Find Words in a 4x4 Letter Grid",
        desc="Two minutes to find every word in a grid of 16 letter cubes. Letters must touch, longer words score way more. The same grid for everyone each day. Free, no sign-up."),
    "typing.html": dict(name="typing game", kind="game", og="typing", list="word", genre=["Typing"],
        title="Typing Test: Free 30-Second WPM Speed Test",
        desc="How fast do you type? A free 30 second typing test with words per minute, accuracy, consistency and a graph of your run. Common or top 1000 words. No sign-up."),
    "crossword.html": dict(name="crossword", kind="game", og="crossword", list="word", genre=["Crossword", "Puzzle"],
        title="Free Crossword Puzzle: A 15x15 Themeless Grid",
        desc="A free 15x15 themeless crossword to solve in your browser. Snacky, quick, and some clues bite back. Check letters as you go, no sign-up."),

    # --- puzzle / skill
    "mines.html": dict(name="minesweeper", kind="game", og="mines", list="puzzle", genre=["Puzzle"],
        title="Minesweeper: Play Free Online, No Download",
        desc="Classic minesweeper in your browser: nine by nine, ten mines, the first click is always safe. Right click or long press to flag. Clear the board as fast as you can."),
    "maze.html": dict(name="cursor maze", kind="game", og="maze", list="skill", genre=["Skill"],
        title="Cursor Maze: Steady Hand Mouse Game, Free",
        desc="Steer your mouse from the green corner to the red one without touching a wall. Touch one and you go back to the start. How steady is your hand?"),
    "reaction.html": dict(name="reaction light", kind="game", og="reaction", list="skill", genre=["Skill"],
        title="Reaction Time Test: How Fast Are You?",
        desc="Wait for the light, then click as fast as you can. Five rounds, your average reaction time in milliseconds is the score. Free, works on phones, no sign-up."),
    "aim.html": dict(name="aim trainer", kind="game", og="aim", list="skill", genre=["Skill"],
        title="Aim Trainer: Free Online Mouse Aim Practice",
        desc="Click the dot, it jumps somewhere new every time you hit it. Thirty seconds, count the hits. A free aim trainer for mouse accuracy and speed."),
    "stopbar.html": dict(name="stop the bar", kind="game", og="stopbar", list="skill", genre=["Skill"],
        title="Stop the Bar: Free Timing Game",
        desc="The marker sweeps back and forth. Stop it inside the green band. Every hit shrinks the band and speeds it up, one miss and you are out. How far can you get?"),
    "driving.html": dict(name="circuit race", kind="game", og="race", list="skill", genre=["Racing"],
        title="Circuit Race: Free 3D Racing Game in Your Browser",
        desc="Race a 3D track against the clock. Hit every checkpoint, drift the corners, boost on the straights and set your best lap. Free racing game, no download."),
    "sushi.html": dict(name="sushi goes round", kind="game", og="sushi", list="skill", genre=["Time management", "Cooking"],
        title="Sushi Goes Round: Free Sushi Restaurant Game",
        desc="Run a conveyor belt sushi bar. Roll what each customer asks for, send it round the belt, and phone for more salmon before it runs out. 15 day career, endless and a daily rush."),
    "deeptime.html": dict(name="deep time", kind="game", og="deeptime", list="skill", genre=["Horror"],
        title="Deep Time: Free Browser Horror Game With Dinosaurs",
        desc="A camcorder tape from a Montana forest, 1987. Find the 8 parts of the time machine in the dark before the thing that came through finds you. Found footage horror. Headphones on."),

    # --- online
    "funstrike.html": dict(name="fun strike", kind="game", og="funstrike", list="online", genre=["Shooter"],
        title="Fun Strike: Free Browser FPS With Bots and Servers",
        desc="A free tactical first person shooter in your browser. Team deathmatch and free for all, bots, a server list, make your own server, kill cam and voice chat. No download."),
    "draw.html": dict(name="draw and guess", kind="game", og="draw", list="online", genre=["Party", "Drawing"],
        title="Draw and Guess: Free Online Drawing Game for Friends",
        desc="One of you draws, the rest guess in the chat. Make a private room and send your friends the link. 2 to 8 players, free, no sign-up."),

    # --- art
    "flipbook.html": dict(name="animation studio", kind="game", og="studio", list="art", genre=["Art"],
        title="Animation Studio: Free Online Flipbook Maker",
        desc="Draw a flipbook frame by frame with onion skin, play it back at 8, 12 or 16 fps, then post it to the gallery. Free, in your browser."),
    "anim-gallery.html": dict(name="animation gallery", kind="page", og="gallery", list="art",
        title="Animation Gallery: Flipbooks Made by Players",
        desc="Looping flipbook animations made by players in the Sortafun animation studio. Vote for your favourite, leave a comment, or make your own."),

    # --- hangout
    "leaderboards.html": dict(name="leaderboards", kind="page", og="boards", list="hang", daily=True,
        title="Leaderboards: Today's Top Scores on Every Game",
        desc="Today's best and the all time best on every Sortafun game. Daily boards reset at midnight Singapore time."),
    "forum.html": dict(name="forum", kind="page", og="forum", list="hang",
        title="The Forum: An Old-School Message Board",
        desc="A message board that has been arguing since 2003: games and scores, keyboards, ham radio, mantises, mile markers and everything else."),
    "guestbook.html": dict(name="guestbook", kind="page", og="guest", list="hang",
        title="Guestbook: Sign It, No Take-Backs",
        desc="Leave a message in the Sortafun guestbook. No take-backs, it's written in pen."),
    "passport.html": dict(name="passport", kind="page", og="passport", list="hang",
        title="Passport: Collect Stamps Around the Site",
        desc="Stamps you earn just by poking around Sortafun: play every game, sign the guestbook, find the secrets."),

    # --- not for search engines
    "404.html": dict(keep="404 &middot; SORTAFUN.ORG", name="404", kind="page", index=False),
    "admin.html": dict(keep="sortafun admin", name="sortafun admin", kind="page", index=False),
    "birdie.html": dict(keep="birdie is now city sandbox &middot; SORTAFUN.ORG", name="birdie", kind="page", index=False),
    "city.html": dict(keep="city sandbox &middot; SORTAFUN.ORG", name="city sandbox", kind="page", index=False),          # archived 2026-10-06
    "clarissa.html": dict(keep="clarissa leaving sfsg simulator &middot; SORTAFUN.ORG", name="the farewell card", kind="page", index=False),  # unlisted on purpose
    "deeptime2.html": dict(keep="deep time part 2 &middot; SORTAFUN.ORG", name="deep time part 2", kind="page", index=False),  # archived 2026-10-06
    "gallery.html": dict(keep="art gallery &middot; SORTAFUN.ORG", name="art gallery", kind="page", index=False),          # easter egg
    "profile.html": dict(keep="profile &middot; SORTAFUN.ORG", name="profile", kind="page", index=False),             # thin, one per name
    "slack.html": dict(keep="sfsg slacking simulator (work in progress) &middot; SORTAFUN.ORG", name="sfsg slacking simulator", kind="page", index=False),  # work in progress
    "taka.html": dict(keep="taka-san dinner simulator &middot; SORTAFUN.ORG", name="taka-san dinner simulator", kind="page", index=False),  # archived, private
}

# names in the link lists (shorter than the titles)
LABEL = {
    "sudoku.html": "Daily Sudoku", "anagram.html": "Word Hive", "five.html": "Five Letters", "ladder.html": "Word Ladder",
    "sides.html": "Four Sides", "puzzle.html": "Tile Slider", "grab.html": "Word Grab", "typing.html": "Typing Test",
    "crossword.html": "Crossword", "mines.html": "Minesweeper", "maze.html": "Cursor Maze", "reaction.html": "Reaction Time Test",
    "aim.html": "Aim Trainer", "stopbar.html": "Stop the Bar", "driving.html": "Circuit Race", "sushi.html": "Sushi Goes Round",
    "deeptime.html": "Deep Time", "funstrike.html": "Fun Strike", "draw.html": "Draw and Guess", "flipbook.html": "Animation Studio",
    "anim-gallery.html": "Animation Gallery", "leaderboards.html": "Leaderboards", "forum.html": "The Forum",
    "guestbook.html": "Guestbook", "passport.html": "Passport",
}
GROUPS = [("daily", "daily puzzles"), ("word", "word games"), ("puzzle", "puzzle"), ("skill", "skill and action"),
          ("online", "play with friends"), ("art", "art"), ("hang", "hang out")]

# ---------------------------------------------------------------------------
# how to play + questions (static text under the game). Facts come from the
# game code, keep them true when a game changes.
# ---------------------------------------------------------------------------
ABOUT = {
    "sudoku.html": dict(h="how to play daily sudoku", p=[
        "fill the 9x9 grid so every row, every column and every 3x3 box has the digits 1 to 9 once each. tap a square, then a number (or type it). the grey digits are given and can't change.",
        "there are three puzzles every day: easy, hard and extreme. everyone gets the same three, and they change at midnight singapore time. every puzzle has exactly one solution.",
        "a wrong number turns red and counts as an error. pencil notes (the notes button, or N) never count, so mark up the candidates as much as you like. undo, erase and pause are all there."],
        faq=[("how is the score worked out?", "each difficulty has a base score (easy 1000, hard 2000, extreme 3000) and a par time (5, 15 and 25 minutes). beat par and you get up to half the base on top, go over and you lose some. every wrong number costs a tenth of the base. you always get at least a tenth of the base for finishing."),
             ("how does the leaderboard work?", "your first solve of the day puts you on today's board, and every puzzle you finish after that adds to your total, live, until midnight. you can change your name until then."),
             ("can i finish on another device?", "yes. once you start, you get a codephrase like fluffy-antelope. type it into continue on your phone or another computer to pick up today's puzzles and your spot on the board."),
             ("where do the puzzles come from?", "the public domain sudoku exchange puzzle bank, graded by the solving techniques they need. easy falls to the basic singles, hard and extreme need more advanced techniques.")]),
    "anagram.html": dict(h="how to play word hive", p=[
        "you get seven letters in a honeycomb. make as many words as you can from them. every word has to be at least 4 letters long and has to use the gold letter in the middle. letters can be used more than once.",
        "a 4 letter word is worth 1 point, longer words are worth 1 point per letter, and a word that uses all seven letters (a pangram) gets 7 extra points. every hive has at least one.",
        "your points move you up the ranks, from wannabee to queen bee. the ranks scale with the day's letters, so a hard hive gets you to the top with fewer points. past queen bee only the rarer words count."],
        faq=[("when is there a new hive?", "every day at midnight singapore time. everyone plays the same letters."),
             ("does my score go on a leaderboard?", "yes, as you play. your first word puts you on today's board and every word after that adds to it, live, until midnight."),
             ("what words count?", "any real english word in the dictionary, 4 letters or more, using the gold letter. no names, no hyphens."),
             ("can i play an old hive?", "yes, the word hive archive has every hive from the last year.")]),
    "five.html": dict(h="how to play five letters", p=[
        "guess the secret five letter word in six tries. every guess has to be a real word. after each guess the tiles change colour: green means the letter is in the word and in the right spot, yellow means it's in the word but somewhere else, grey means it isn't in the word at all.",
        "there is one word a day, the same for everyone, and you get one go at it. the fewer guesses you need, the better your score on today's board."],
        faq=[("when is the new word?", "at midnight singapore time, every day."),
             ("can letters repeat?", "yes. a letter only shows yellow as many times as it is really in the word."),
             ("can i share my result?", "yes, the share button copies your grid of coloured squares without the letters, so it gives nothing away.")]),
    "ladder.html": dict(h="how to play word ladder", p=[
        "start at the green word and climb to the red word by changing one letter at a time. every step has to be a real four letter word.",
        "par is the shortest ladder possible. match it or beat everyone else's rung count on today's board. there is a new ladder every day at midnight singapore time."],
        faq=[("can i change the order of the letters?", "no, only swap one letter for another, in the same place."),
             ("is there always a solution?", "yes, every daily ladder is checked: par is the length of the shortest one.")]),
    "sides.html": dict(h="how to play four sides", p=[
        "there are twelve letters, three on each side of a box. make words of 3 or more letters, but two letters in a row can't come from the same side. each new word starts with the last letter of the one before.",
        "use every letter at least once, in as few words as you can. there is always a way in two words, and that's par."],
        faq=[("when is there a new box?", "every day at midnight singapore time, the same box for everyone."),
             ("can i reuse letters?", "yes, as often as you like, as long as you don't use two from the same side in a row.")]),
    "puzzle.html": dict(h="how to play tile slider", p=[
        "the eight numbered tiles are scrambled in a 3x3 frame with one gap. slide tiles into the gap until they read 1 to 8 in order with the gap at the end. click a tile next to the gap, or use the arrow keys.",
        "everyone gets the same scramble each day. the fewer moves you take, the better."],
        faq=[("is every scramble solvable?", "yes. the scramble is made by sliding tiles away from the solved position, so it can always be slid back.")]),
    "grab.html": dict(h="how to play word grab", p=[
        "you have two minutes to find words in a 4x4 grid of letter cubes. a word is a path of cubes that touch, sideways, up, down or diagonally, and each cube can be used once per word. words need 3 or more letters.",
        "longer words score far more: 3 and 4 letters 1 point, 5 letters 2, 6 letters 3, 7 letters 5, and 8 or more 11. at the end you see the common words you missed."],
        faq=[("is it the same grid for everyone?", "yes, a new grid every day at midnight singapore time."),
             ("can i type instead of tapping?", "yes, type the word and press enter, or tap the cubes in order.")]),
    "typing.html": dict(h="about the typing test", p=[
        "type the words as they scroll past for 30 seconds. wrong letters turn red, and backspace fixes a mistake. pick the 200 most common english words, or the top 1000 for something harder.",
        "your words per minute (wpm) counts the characters you typed right, divided by five, per minute. you also get raw speed, accuracy, consistency and a graph of your speed through the run."],
        faq=[("what is a good typing speed?", "around 40 wpm is average. 60 to 80 is fast, and over 100 is very fast."),
             ("how do i restart?", "press escape, or tab while you are typing.")]),
    "mines.html": dict(h="how to play minesweeper", p=[
        "the board is nine by nine with ten mines hidden in it. left click a square to clear it. a number tells you how many mines touch that square. right click (or long press on a phone) to flag a square you think is a mine.",
        "the first click is always safe. clear every square that isn't a mine to win. your time goes on the leaderboard."],
        faq=[("what if there's nothing to go on?", "sometimes two squares are equally likely. it happens in every minesweeper. take the guess.")]),
    "reaction.html": dict(h="about the reaction time test", p=[
        "click to start, then wait for the bottom lamp to light up and click as fast as you can. the wait is random, roughly 1 to 4.5 seconds. click before the light and that round doesn't count.",
        "you get five rounds, and your average reaction time in milliseconds is your score."],
        faq=[("what is a normal reaction time?", "most people land between 200 and 300 milliseconds. under 200 is quick."),
             ("does my mouse matter?", "a little. a wired mouse and a fast screen shave a few milliseconds off.")]),
    "aim.html": dict(h="about the aim trainer", p=[
        "a dot appears somewhere on the board. click it and it jumps somewhere new. you have thirty seconds: every hit counts, and the dots come in different sizes.",
        "it's good warm up for shooters and for mouse accuracy in general. your hit count goes on the leaderboard."]),
    "crossword.html": dict(h="about the crossword", p=[
        "a 15x15 themeless crossword, made by Caleb. click a square and type. the clue for the word you're in shows in the clue bar (tap it to switch between across and down). check, reveal a square or reveal the whole grid when you're stuck.",
        "no theme to crack, just a grid of good fill. some clues are snacky, some bite back."]),
}

# ---------------------------------------------------------------------------
def esc(s):
    return html.escape(s, quote=False).replace('"', "&quot;")  # apostrophes stay readable


def check_text(where, s):
    bad = [c for c in s if ord(c) > 126]
    if bad:
        sys.exit("seo.py: non-ASCII %r in %s (house voice is plain ASCII)" % ("".join(sorted(set(bad))), where))
    for word in ("wordle", "spelling bee", "letter boxed", "boggle", "counter-strike", "counter strike", "cs:go", "csgo", "dust ii", "dust2", "slender"):
        if word in s.lower():
            sys.exit("seo.py: trademarked name %r in %s" % (word, where))


def head_block(fn, p):
    url = SITE if fn == "index.html" else SITE + fn
    title = p["title"] if p.get("kind") == "home" else (p.get("title") or p["name"]) + " | Sortafun"
    out = ["<!-- seo (written by tools/seo.py: edit PAGES there, not here) -->",
           # hidden pages keep the tab title they always had (raw HTML, `keep`)
           "<title>%s</title>" % (p["keep"] if p.get("keep") else esc(title))]
    if p.get("desc"):
        out.append('<meta name="description" content="%s">' % esc(p["desc"]))
    out.append('<meta name="sortafun:name" content="%s">' % esc(p["name"]))
    if not p.get("index", True):
        out.append('<meta name="robots" content="noindex">')
        out.append("<!-- /seo -->")
        return "\n".join(out)
    img = SITE + "assets/og/%s.png" % p["og"]
    out += ['<link rel="canonical" href="%s">' % url,
            '<meta property="og:type" content="website">',
            '<meta property="og:site_name" content="Sortafun">',
            '<meta property="og:title" content="%s">' % esc(title),
            '<meta property="og:description" content="%s">' % esc(p["desc"]),
            '<meta property="og:url" content="%s">' % url,
            '<meta property="og:image" content="%s">' % img,
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            '<meta property="og:image:alt" content="%s">' % esc(LABEL.get(fn, "Sortafun") + " on Sortafun"),
            '<meta name="twitter:card" content="summary_large_image">',
            '<meta name="twitter:title" content="%s">' % esc(title),
            '<meta name="twitter:description" content="%s">' % esc(p["desc"]),
            '<meta name="twitter:image" content="%s">' % img,
            '<meta name="theme-color" content="#ffd43b">']
    org = {"@type": "Organization", "name": "Sortafun", "url": SITE}
    if p["kind"] == "home":
        ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": "Sortafun", "alternateName": "sortafun.org",
               "url": SITE, "description": p["desc"], "publisher": org}]
    else:
        ld = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Sortafun", "item": SITE},
            {"@type": "ListItem", "position": 2, "name": LABEL.get(fn, p["name"]), "item": url}]}]
        if p["kind"] == "game":
            ld.insert(0, {"@context": "https://schema.org", "@type": "VideoGame", "name": LABEL.get(fn, p["name"]), "url": url,
                          "description": p["desc"], "image": img, "genre": p.get("genre", []),
                          "gamePlatform": "Web browser", "applicationCategory": "GameApplication", "operatingSystem": "Any",
                          "inLanguage": "en", "isAccessibleForFree": True,
                          "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "publisher": org})
    for item in ld:
        out.append('<script type="application/ld+json">%s</script>' % json.dumps(item, separators=(",", ":")))
    out.append("<!-- /seo -->")
    return "\n".join(out)


def listed(group=None):
    return [fn for fn, p in PAGES.items() if p.get("index", True) and p.get("list") and (group is None or p["list"] == group)]


def more_block(fn):
    """a strip of plain links: same group first, then the daily puzzles, then the rest"""
    me = PAGES[fn].get("list")
    order = [f for f in listed(me) if f != fn] + [f for f in listed("daily") if f != fn] + [f for f in listed() if f != fn]
    seen, pick = set(), []
    for f in order:
        if f not in seen and PAGES[f]["kind"] == "game":
            seen.add(f); pick.append(f)
    pick = pick[:8]
    li = "".join('<li><a href="%s">%s</a></li>' % (f, esc(LABEL[f])) for f in pick)
    return ('<!-- seo:more -->\n  <nav class="seo-x more-games" aria-label="more games"><h2>more free games</h2><ul>%s</ul>'
            '<p><a href="index.html">all games &raquo;</a></p></nav>\n  <!-- /seo:more -->' % li)


def about_block(fn):
    a = ABOUT[fn]
    parts = ['<!-- seo:about -->\n  <section class="seo-x about-game">', "<h2>%s</h2>" % esc(a["h"])]
    parts += ["<p>%s</p>" % esc(t) for t in a["p"]]
    if a.get("faq"):
        parts.append("<h3>questions</h3><dl>")
        parts += ["<dt>%s</dt><dd>%s</dd>" % (esc(q), esc(ans)) for q, ans in a["faq"]]
        parts.append("</dl>")
    parts.append("</section>\n  <!-- /seo:about -->")
    return "".join(parts[:1]) + "\n    " + "\n    ".join(parts[1:-1]) + "\n  " + parts[-1]


def links_block():
    rows = []
    for g, label in GROUPS:
        fs = listed(g)
        if fs:
            rows.append('<p><b>%s:</b> %s</p>' % (label, " &middot; ".join('<a href="%s">%s</a>' % (f, esc(LABEL[f])) for f in fs)))
    return ('<!-- seo:links -->\n  <nav class="seo-x allgames" aria-label="every game on sortafun">'
            '<style>.allgames{max-width:1100px;margin:18px auto 0;padding:10px 14px;font-size:12px;line-height:1.7;color:#1d1b2e;'
            'background:rgba(255,255,255,.85);border:3px solid #1d1b2e;border-radius:12px}.allgames p{margin:0}'
            '.allgames a{color:#1d1b2e}html.panic .allgames{display:none}</style>\n    '
            + "\n    ".join(rows) + "\n  </nav>\n  <!-- /seo:links -->")


# old head tags outside the block: each one eats only its own line
HEAD_JUNK = [r"[ \t]*" + j + r"[ \t]*\r?\n?" for j in (
    r"<title>.*?</title>", r'<meta name="description"[^>]*>', r'<meta name="robots"[^>]*>',
    r'<meta property="og:[^"]*"[^>]*>', r'<meta name="twitter:[^"]*"[^>]*>', r'<link rel="canonical"[^>]*>',
    r'<meta name="theme-color"[^>]*>', r'<meta name="sortafun:name"[^>]*>')]


def set_block(s, start, end, block, anchor_re, fn, before=True, nl="\n"):
    """replace start..end with block, or put block at anchor (before/after its match)"""
    pat = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if pat.search(s):
        return pat.sub(lambda m: block, s, count=1) if block else re.sub(r"[ \t]*" + pat.pattern + r"\r?\n?", "", s, count=1, flags=re.S)
    if not block:
        return s
    m = re.search(anchor_re, s)
    if not m:
        sys.exit("seo.py: no place for %s in %s (%s)" % (start, fn, anchor_re))
    i = m.start() if before else m.end()
    if before:
        line_start = s.rfind("\n", 0, i) + 1
        indent = s[line_start:i] if s[line_start:i].strip() == "" else ""
        return s[:line_start] + indent + block + nl + s[line_start:]
    return s[:i] + block + nl + s[i:]


def process(fn):
    p = PAGES[fn]
    for k in ("title", "desc"):
        if p.get(k):
            check_text(fn + " " + k, p[k])
    raw = open(fn, "rb").read().decode("utf-8")
    s = raw
    nl = "\r\n" if "\r\n" in raw[:2000] else "\n"  # keep the file's own line endings
    # head: drop old tags outside the block, then (re)write the block after the viewport meta
    h_end = s.index("</head>")
    head, rest = s[:h_end], s[h_end:]
    head = re.sub(r"<!-- seo .*?<!-- /seo -->\s*\n?", "", head, flags=re.S)
    for j in HEAD_JUNK:
        head = re.sub(j, "", head, flags=re.S)
    m = re.search(r'<meta name="viewport"[^>]*>\r?\n', head) or re.search(r"<meta charset[^>]*>\r?\n", head)
    if not m:
        sys.exit("seo.py: no viewport / charset meta to put the block after in " + fn)
    head = head[:m.end()] + head_block(fn, p).replace("\n", nl) + nl + head[m.end():]
    s = head + rest
    # body
    if fn == "index.html":
        s = set_block(s, "<!-- seo:links -->", "<!-- /seo:links -->", links_block().replace("\n", nl), r'<footer class="sitefoot" id="foot">', fn, nl=nl)
    else:
        game = p.get("index", True) and p.get("kind") == "game"
        if fn in ABOUT:
            for t in ABOUT[fn]["p"]:
                check_text(fn + " about", t)
            for q, a in ABOUT[fn].get("faq", []):
                check_text(fn + " faq", q + " " + a)
        s = set_block(s, "<!-- seo:about -->", "<!-- /seo:about -->", about_block(fn).replace("\n", nl) if fn in ABOUT and game else "", r'<a class="back"', fn, nl=nl)
        s = set_block(s, "<!-- seo:more -->", "<!-- /seo:more -->", more_block(fn).replace("\n", nl) if game else "", r'<a class="back"', fn, nl=nl)
    if s != raw:
        open(fn, "wb").write(s.encode("utf-8"))
        return True
    return False


def lastmod(fn):
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cI", "--", fn], capture_output=True, text=True).stdout.strip()
        return out[:10] or None
    except Exception:
        return None


def sitemap():
    rows = []
    for fn, p in PAGES.items():
        if not p.get("index", True):
            continue
        url = SITE if fn == "index.html" else SITE + fn
        pri = "1.0" if fn == "index.html" else "0.9" if p.get("list") == "daily" else "0.8" if p["kind"] == "game" else "0.5"
        lm = lastmod(fn)
        rows.append("  <url><loc>%s</loc>%s<changefreq>%s</changefreq><priority>%s</priority></url>" % (
            url, "<lastmod>%s</lastmod>" % lm if lm else "", "daily" if p.get("daily") or fn == "index.html" else "weekly", pri))
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"
    changed = not os.path.exists("sitemap.xml") or open("sitemap.xml", encoding="utf-8").read() != xml
    if changed:
        open("sitemap.xml", "w", encoding="utf-8", newline="\n").write(xml)
    robots = "User-agent: *\nAllow: /\n\nSitemap: %ssitemap.xml\n" % SITE
    if not os.path.exists("robots.txt") or open("robots.txt", encoding="utf-8").read() != robots:
        open("robots.txt", "w", encoding="utf-8", newline="\n").write(robots)
        changed = True
    return changed


def main():
    pages = sorted(f for f in os.listdir(".") if f.endswith(".html"))
    missing = [f for f in pages if f not in PAGES]
    if missing:
        sys.exit("seo.py: no row in PAGES for: " + ", ".join(missing) + " (add one, index=False if it shouldn't be found)")
    gone = [f for f in PAGES if f not in pages]
    if gone:
        sys.exit("seo.py: rows for pages that don't exist: " + ", ".join(gone))
    for fn in listed():
        if fn not in LABEL:
            sys.exit("seo.py: listed page %s has no LABEL" % fn)
    for fn, p in PAGES.items():
        if p.get("index", True) and not os.path.exists("assets/og/%s.png" % p["og"]):
            print("seo.py: warning, no assets/og/%s.png yet (node tools/og-images.mjs)" % p["og"])
    changed = [f for f in pages if process(f)]
    if sitemap():
        changed.append("sitemap.xml / robots.txt")
    print("seo: " + (", ".join(changed) if changed else "nothing to change"))


if __name__ == "__main__":
    main()
