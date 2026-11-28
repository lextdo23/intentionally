// When each card fits in someone's day (alex 2026-11-28, thread "Build choosing when to do cards"). Every live card has
// one tag; `node cards/check.cjs` fails if a live card has none, or a tag isn't one of these:
//   a          any time: fits any moment, so "Keep it for" asks which (top 3 moments plus Now)
//   n          tonight only: goes straight to the evening moment (After dinner), no question
//   t:<moment> tied to one time of day: goes straight to that moment (breakfast, way, lunch, work, dinner), no question
//   d          all day: runs through the day (like "check messages 3 times today"), no question
//   c          when it comes up: happens when the moment arises (a queue, a hard feeling), no question
//   s          has a date, runs over a week, or follows other people's schedule (a class, a gig): keeps its own flow
//              (every card in LATER in js/later.js is "s")
// A new card gets its tag here when it's added (cards/RULES.md, rule C11).
export const TAGS = ["a", "n", "d", "c", "s"], MOMENT_TAGS = ["breakfast", "way", "lunch", "work", "dinner"];
export const WHEN = {
  1: "c", 2: "c", 6: "s", 8: "c", 9: "a", 10: "a", 12: "a", 13: "a", 14: "c", 15: "a", 16: "s", 17: "c", 18: "t:lunch",
  19: "c", 20: "c", 22: "a", 25: "a", 26: "s", 27: "a", 29: "s", 30: "s", 31: "a", 32: "s", 33: "a", 37: "a", 38: "a",
  39: "a", 40: "a", 41: "c", 43: "a", 44: "a", 45: "a", 46: "a", 48: "a", 49: "a", 54: "a", 55: "a", 57: "s", 58: "a",
  59: "a", 60: "s", 63: "s", 64: "c", 65: "c", 66: "a", 67: "a", 70: "a", 71: "a", 72: "c", 76: "a", 77: "c", 78: "a",
  80: "n", 83: "s", 84: "a", 87: "c", 88: "s", 89: "a", 91: "a", 122: "a", 124: "a", 128: "d", 130: "s", 131: "a",
  133: "t:way", 134: "a", 135: "s", 136: "a", 141: "a", 143: "a", 166: "a", 167: "a", 173: "n", 175: "n", 179: "a",
  180: "t:lunch", 181: "t:work", 182: "s", 183: "a", 184: "a", 185: "t:breakfast", 186: "d", 187: "n", 189: "n",
  368: "c", 369: "a", 370: "a", 371: "a", 372: "a", 373: "a", 374: "c", 375: "c", 376: "a", 377: "a", 378: "a",
  379: "c", 380: "a", 381: "a", 382: "a", 383: "a", 384: "a", 385: "a", 386: "a", 387: "a", 388: "s", 389: "s",
  390: "s", 391: "s", 392: "c", 393: "s", 394: "s", 395: "s", 396: "s", 397: "a", 398: "a", 399: "s", 400: "a",
  401: "s", 402: "n", 403: "a", 404: "t:work", 405: "d", 406: "n", 407: "n", 408: "a", 409: "a", 410: "a", 411: "a",
  412: "n", 413: "s", 414: "a", 415: "c", 416: "a", 417: "c", 418: "c", 419: "a", 420: "a", 421: "a", 422: "d",
  423: "a", 424: "a", 425: "d", 426: "d", 427: "d", 428: "s", 429: "a", 430: "a", 431: "a", 432: "a", 433: "a",
  434: "a", 435: "a", 436: "a", 437: "a", 438: "a", 439: "a", 440: "c", 441: "a", 442: "a", 443: "a", 444: "d",
  445: "n", 446: "a", 447: "a", 448: "a", 449: "c", 450: "c", 451: "a", 452: "a", 453: "a", 454: "a", 455: "a",
  456: "t:lunch", 457: "c", 458: "c", 459: "a", 460: "s", 461: "a", 462: "a", 463: "a", 464: "a", 465: "a", 466: "a",
  467: "a", 468: "a", 469: "a", 470: "s", 471: "a", 472: "a", 473: "a", 474: "c", 475: "a", 476: "d", 477: "a",
  478: "a", 479: "d", 480: "t:way", 481: "a", 482: "s", 483: "a", 484: "s", 485: "a", 486: "n", 487: "a", 488: "s",
  489: "a", 490: "a", 491: "a", 492: "a", 493: "s", 494: "a", 495: "a", 496: "s", 497: "a", 498: "n", 499: "a",
  500: "d", 501: "a", 502: "a", 503: "d", 504: "s", 505: "s", 506: "a", 507: "a", 508: "a", 509: "a", 510: "a",
  511: "a", 512: "a", 513: "a", 514: "t:work", 515: "a", 516: "a", 517: "a", 518: "a", 519: "a", 520: "a", 521: "a",
  522: "a", 523: "s", 524: "a", 525: "a", 526: "a", 527: "a", 528: "a", 529: "n", 530: "a", 531: "s", 532: "a",
  533: "a", 534: "s", 535: "a", 536: "a", 537: "n", 538: "a", 539: "a", 540: "s", 541: "a", 542: "a", 543: "a",
  544: "a", 545: "a", 546: "a", 547: "s", 548: "a", 549: "a", 550: "a", 551: "a", 552: "n", 553: "d", 554: "a",
  555: "a", 556: "c", 557: "a", 558: "a", 559: "s", 560: "d", 561: "a", 562: "a", 563: "s", 564: "n", 565: "a",
  566: "a", 567: "a", 568: "a", 569: "a", 570: "a", 571: "d", 572: "a", 573: "d", 574: "c", 575: "a", 576: "a",
  577: "a", 578: "a", 579: "a", 580: "a", 581: "c", 582: "a", 583: "a", 584: "c", 585: "s", 586: "s", 587: "s",
  588: "s", 589: "s",
};
export const whenOf = (id) => WHEN[id] || "a";   // own cards and library cards: any time
export const validTag = (t) => TAGS.includes(t) || (/^t:/.test(t) && MOMENT_TAGS.includes(t.slice(2)));
