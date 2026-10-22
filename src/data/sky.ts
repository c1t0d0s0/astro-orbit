import raw from './stars.json';

// 星と星座。星の位置は 2000 年の値 (歳差で 26 年に約 0.36° ずれるが、見た目には分からない)

export interface Star {
  ra: number;
  dec: number;
  mag: number;
  bv: number;
  name: string;
}

export const STARS: readonly Star[] = (raw as [number, number, number, number, string][]).map(([ra, dec, mag, bv, name]) => ({ ra, dec, mag, bv, name }));

const byName = new Map(STARS.filter((s) => s.name).map((s) => [s.name, s]));
export const starByName = (name: string) => byName.get(name);

export interface Constellation {
  name: string;
  /** 線でつなぐ星の組 (バイエル符号) */
  lines: [string, string][];
}

const chain = (...names: string[]): [string, string][] => names.slice(1).map((n, i) => [names[i], n]);

/** 教科書によく出る星座と、季節の大三角など */
export const CONSTELLATIONS: readonly Constellation[] = [
  {
    name: 'オリオン座(ざ)',
    lines: [
      ['AlpOri', 'GamOri'],
      ['AlpOri', 'ZetOri'],
      ['GamOri', 'DelOri'],
      ...chain('DelOri', 'EpsOri', 'ZetOri'),
      ['ZetOri', 'KapOri'],
      ['DelOri', 'BetOri'],
      ['AlpOri', 'LamOri'],
      ['GamOri', 'LamOri'],
    ],
  },
  { name: '北斗七星(ほくとしちせい)', lines: [...chain('EtaUMa', 'ZetUMa', 'EpsUMa', 'DelUMa', 'AlpUMa', 'BetUMa', 'GamUMa', 'DelUMa')] },
  { name: 'こぐま座(ざ)', lines: [...chain('AlpUMi', 'DelUMi', 'EpsUMi', 'ZetUMi', 'EtaUMi', 'GamUMi', 'BetUMi', 'ZetUMi')] },
  { name: 'カシオペヤ座(ざ)', lines: chain('EpsCas', 'DelCas', 'GamCas', 'AlpCas', 'BetCas') },
  { name: '夏(なつ)の大三角(だいさんかく)', lines: chain('AlpLyr', 'AlpCyg', 'AlpAql', 'AlpLyr') },
  { name: 'はくちょう座(ざ)', lines: [...chain('AlpCyg', 'GamCyg', 'Bet1Cyg'), ['EpsCyg', 'GamCyg'], ['GamCyg', 'DelCyg']] },
  {
    name: 'さそり座(ざ)',
    lines: [
      ['Bet1Sco', 'DelSco'],
      ['DelSco', 'PiSco'],
      ...chain('DelSco', 'SigSco', 'AlpSco', 'TauSco', 'EpsSco', 'Mu1Sco', 'Zet2Sco', 'EtaSco', 'TheSco', 'Iot1Sco', 'KapSco', 'LamSco'),
    ],
  },
  { name: '冬(ふゆ)の大三角(だいさんかく)', lines: chain('AlpOri', 'AlpCMa', 'AlpCMi', 'AlpOri') },
  { name: 'しし座(ざ)', lines: [...chain('AlpLeo', 'EtaLeo', 'Gam1Leo', 'ZetLeo', 'MuLeo', 'EpsLeo'), ...chain('Gam1Leo', 'DelLeo', 'BetLeo', 'TheLeo', 'AlpLeo')] },
  { name: '秋(あき)の四辺形(しへんけい)', lines: chain('AlpPeg', 'BetPeg', 'AlpAnd', 'GamPeg', 'AlpPeg') },
  { name: '南十字(みなみじゅうじ)', lines: [['Alp1Cru', 'GamCru'], ['BetCru', 'DelCru']] },
];
