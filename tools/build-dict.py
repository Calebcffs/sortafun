#!/usr/bin/env python3
# Rebuilds dict.js, the dictionary the word games use. See CLAUDE.md "the dictionary".
#
#   pip install --user wordfreq spylls
#   curl -sSfL -o enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
#   python3 tools/build-dict.py        (run from the repo root, needs Fedora's hunspell en_US + en_GB)
#
# accepted words = ENABLE (the classic public domain word game list, no proper nouns)
#                + newer words (email, emoji, podcast...) that wordfreq knows and a
#                  hunspell spellchecker accepts in lowercase (so names like "london" stay out)
# common words (UPPERCASE in dict.js) = zipf frequency >= 2.9, spellchecker-valid,
#                  not on the block list. puzzles are only ever built from these.
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# ---- step 1: find the extra modern words ----
import re, json, wordfreq
from spylls.hunspell import Dictionary
us = Dictionary.from_files('/usr/share/hunspell/en_US')
gb = Dictionary.from_files('/usr/share/hunspell/en_GB')
enable = set(w.strip() for w in open(os.environ.get('ENABLE','../enable1.txt')) if re.fullmatch(r'[a-z]+', w.strip()))
# every word wordfreq knows (lowercased), kept only if a spellchecker accepts it in lowercase
cands = [w for w in wordfreq.iter_wordlist('en', wordlist='large') if re.fullmatch(r'[a-z]{3,15}', w)]
extra = set()
for w in cands:
    if w in enable: continue
    if wordfreq.zipf_frequency(w, 'en') < 1.8: continue
    if us.lookup(w) or gb.lookup(w): extra.add(w)
allw = sorted(w for w in (enable | extra) if 3 <= len(w) <= 15)
print('enable', len(enable), 'extra', len(extra), 'total', len(allw))
json.dump(sorted(extra), open('extra.json','w'))


# ---- step 2: filter, mark common words, write dict.js ----
import re, json, wordfreq
HELPER = r'''
/* SortafunDict.has("word")      -> true if it's a real word (any case in)
   SortafunDict.common           -> array of the common words, lowercase
   SortafunDict.commonLen(n)     -> common words of exactly n letters
   SortafunDict.all              -> every word, lowercase (built on first use) */
window.SortafunDict = (function () {
  var set = null, all = null, common = null, byLen = {};
  function build() {
    if (set) return;
    var raw = window.SORTAFUN_DICT_RAW.split(" ");
    set = new Set(); all = new Array(raw.length); common = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i], lw = w.toLowerCase();
      all[i] = lw; set.add(lw);
      if (w !== lw) common.push(lw);
    }
  }
  return {
    has: function (w) { build(); return set.has(String(w).toLowerCase()); },
    get common() { build(); return common; },
    get all() { build(); return all; },
    commonLen: function (n) {
      build();
      if (!byLen[n]) byLen[n] = common.filter(function (w) { return w.length === n; });
      return byLen[n];
    }
  };
})();
'''
from spylls.hunspell import Dictionary
us = Dictionary.from_files('/usr/share/hunspell/en_US')
gb = Dictionary.from_files('/usr/share/hunspell/en_GB')
enable = set(w.strip() for w in open(os.environ.get('ENABLE','../enable1.txt')) if re.fullmatch(r'[a-z]+', w.strip()))
extra = set(json.load(open('extra.json')))
junk = set('chg lieut ltd sch div sci approx initio froid criss bester assn govt dept intl natl acct misc etc incl mgmt corp inc bldg blvd lemme capt gonna wanna gotta dunno coll'.split())
ROMAN = re.compile(r'^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$')
extra = {w for w in extra if not ROMAN.match(w) and len(w) >= 4 and re.search('[aeiouy]', w) and w not in junk}
allw = sorted(w for w in (enable | extra) if 3 <= len(w) <= 15)
# never used as a generated answer (still accepted if typed)
block = set('''fuck fucks fucked fucker fucking shit shits shitty cunt cunts cock cocks dick dicks dickhead
pussy pussies twat twats wank wanker whore whores slut sluts bitch bitches bastard bastards piss pissed
nigger niggers nigga faggot faggots fag fags dyke dykes kike kikes spic spics chink chinks gook gooks
retard retards retarded tranny trannies coon coons wetback wetbacks paki pakis raghead negro negroes
rape raped rapes rapist anal anus arse arses boob boobs tits titty penis vagina semen dildo dildos
jizz cum cums porn porno horny nude nudes naked sexy sex nazi nazis jihad jihadist hitler kill killed
killer killing murder murdered suicide dead death
mick micks vols libs tony dago dagos wop wops jap japs gyp gyps gypped homo homos lesbo lesbos
hoe hoes skank skanks bimbo bimbos poof poofs pikey gimp gimps spaz tard tards'''.split())
def zipf(w): return wordfreq.zipf_frequency(w, 'en')
common = set(w for w in allw if w not in block and zipf(w) >= 2.9 and w not in junk and not (ROMAN.match(w) and w not in enable) and (us.lookup(w) or gb.lookup(w)))
print('all', len(allw), 'common', len(common))
for n in (4,5): print(n, sum(1 for w in common if len(w)==n))
out = ' '.join(w.upper() if w in common else w for w in allw)
js = ('/* sortafun dictionary. generated, do not hand edit (see CLAUDE.md, "the dictionary").\n'
      '   every word is accepted when typed. UPPERCASE words are the common ones the\n'
      '   games build puzzles from. no proper nouns. */\n'
      'window.SORTAFUN_DICT_RAW = "' + out + '";\n' + HELPER)
open('../dict.js','w').write(js)
print(len(js))
