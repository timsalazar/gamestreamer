import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadPageStats(pagePath) {
  const html = fs.readFileSync(pagePath, 'utf8');
  const script = html
    .match(/<script>([\s\S]*)<\/script>/)[1]
    .replace(/\n\s*init\(\);\s*$/, '');

  const context = {
    console,
    URLSearchParams,
    location: { search: '' },
    setTimeout,
    clearTimeout,
    document: {
      getElementById() {
        return { innerHTML: '', style: {}, textContent: '' };
      },
      createElement() {
        return {};
      },
      head: {
        appendChild() {},
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(script, context);
  return context;
}

const scoringPlays = [
  {
    half: 'top',
    structured_play: {
      play_type: 'single',
      batter: 'Alex',
      pitcher: 'Parker',
      outs_recorded: 0,
      runs_scored: 0,
      runners: [{ name: 'Alex', from: 'home', to: '1' }],
    },
  },
  {
    half: 'top',
    structured_play: {
      play_type: 'double',
      batter: 'Beth',
      pitcher: 'Parker',
      outs_recorded: 0,
      runs_scored: 1,
      runners: [
        { name: 'Alex', from: '1', to: 'H' },
        { name: 'Beth', from: 'home', to: '2' },
      ],
    },
  },
  {
    half: 'top',
    structured_play: {
      play_type: 'walk',
      batter: 'Cal',
      pitcher: 'Parker',
      outs_recorded: 0,
      runs_scored: 0,
      runners: [{ name: 'Cal', from: 'home', to: '1' }],
    },
  },
  {
    half: 'top',
    structured_play: {
      play_type: 'strikeout',
      batter: 'Dee',
      pitcher: 'Parker',
      outs_recorded: 1,
      runs_scored: 0,
      runners: [],
    },
  },
];

describe('play-by-play stats credit both batter and pitcher', () => {
  for (const pagePath of ['public/boxscore.html', 'public/viewer.html']) {
    test(`${pagePath} credits hits, walks, strikeouts, and runs to the pitcher`, () => {
      const { computeBatting, computePitching } = loadPageStats(pagePath);

      const batting = computeBatting(scoringPlays);
      const pitching = computePitching(scoringPlays);

      assert.equal(batting.get('Alex').h, 1, 'single credited to batter');
      assert.equal(batting.get('Alex').r, 1, 'runner scoring credited to batter run total');
      assert.equal(batting.get('Beth').h, 1, 'double credited to batter');
      assert.equal(batting.get('Beth').rbi, 1, 'scoring double credited as batter RBI');
      assert.equal(batting.get('Cal').bb, 1, 'walk credited to batter');
      assert.equal(batting.get('Dee').so, 1, 'strikeout credited to batter');

      const pitcher = pitching.get('Parker');
      assert.equal(pitcher.h, 2, 'single and double credited against pitcher');
      assert.equal(pitcher.bb, 1, 'walk credited against pitcher');
      assert.equal(pitcher.so, 1, 'strikeout credited to pitcher');
      assert.equal(pitcher.r, 1, 'run credited against pitcher');
      assert.equal(pitcher.er, 1, 'earned run credited against pitcher by default');
      assert.equal(pitcher.ip_outs, 1, 'strikeout out credited to pitcher innings');
    });
  }
});
