// Simulation d'équilibrage sans rendu : `npm run sim`.
// Des joueurs automatiques (adroit, moyen, maladroit) enchaînent les parties en dépensant tout
// entre chaque partie ; on affiche le niveau atteint et le temps de jeu cumulé.
import { appendFileSync } from 'node:fs';
import { test } from 'vitest';
import { doubleRunDiamonds, startRun } from '../src/game/actions';
import { AutoPlayer, spendCoins, spendMeta } from '../src/game/autoplayer';
import type { AutoPlayerOptions } from '../src/game/autoplayer';
import { ABILITIES, ACHIEVEMENTS, BALANCE, CANNONS, WEAPONS } from '../src/game/config';
import { checkpointCoins, worldStart, worldsUnlocked } from '../src/game/formulas';
import type { GameEvent } from '../src/game/events';
import { STEP, step } from '../src/game/simulation';
import { createState } from '../src/game/state';

/** Temps passé dans les menus entre deux parties (secondes). */
const MENU_TIME = 20;
const MAX_HOURS = Number(process.env.SIM_HOURS ?? 40);
const MAX_RUN_SECONDS = 3 * 3600;

const PLAYERS: Record<string, AutoPlayerOptions> = {
  adroit: { reaction: 0.12, noise: 0.02, blindness: 0.08, seed: 3 },
  moyen: { reaction: 0.16, noise: 0.03, blindness: 0.15, seed: 7 },
  maladroit: { reaction: 0.24, noise: 0.05, blindness: 0.3, seed: 11 },
};

const only = process.env.SIM_PLAYER;

/** Affiche, et écrit aussitôt dans SIM_LOG si défini (une longue simulation reste lisible en cours de route). */
function log(text: string): void {
  console.log(text);
  if (process.env.SIM_LOG) appendFileSync(process.env.SIM_LOG, text + '\n');
}

for (const [name, opts] of Object.entries(PLAYERS)) {
  if (only && only !== name) continue;
  test(name, () => {
    const s = createState(42);
    const player = new AutoPlayer(opts);
    const ev: GameEvent[] = [];
    const milestones = [5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 250];
    const reached: string[] = [];
    const lines: string[] = [];
    let total = 0;
    let runIdx = 0;
    const first: number[] = [];
    const gains: number[] = [];
    const runLog: string[] = [];
    let coinNote = '';
    // Déblocages : premier instant (heures de jeu) où chaque élément est obtenu.
    const unlocks = new Map<string, number>();
    const note = (key: string, ok: boolean) => {
      if (!ok || unlocks.has(key)) return;
      unlocks.set(key, total / 3600);
      // Affiché tout de suite : une longue simulation reste lisible même interrompue.
      log(`› ${name} ${(total / 3600).toFixed(1)} h : ${key} (niveau max ${s.meta.bestLevel})`);
    };
    const track = () => {
      const m = s.meta;
      for (const id of CANNONS) note(`canon ${id}`, m.cannons[id]);
      for (const id of WEAPONS) note(`arme ${id}`, m.weapons[id] > 0);
      for (let w = 1; w <= BALANCE.worlds.length; w++) note(`monde ${w} terminé`, m.highestCleared >= w * BALANCE.levelsPerWorld);
      note('toutes les capacités au maximum', ABILITIES.every((a) => m.abilities[a] >= BALANCE.abilities[a].maxLevel));
      note('toutes les armes au maximum', WEAPONS.every((w) => m.weapons[w] >= BALANCE.weapons[w].maxLevel));
      for (const share of [0.25, 0.5, 0.75, 1]) note(`succès ${share * 100} %`, m.achievements.length >= Math.ceil(ACHIEVEMENTS.length * share));
    };
    s.meta.stats.runs = 1;
    while (total < MAX_HOURS * 3600 && s.meta.bestLevel <= 260) {
      let rt = 0;
      let lastBuy = 0;
      const lv: Record<number, { w: number; b: number; hits: number }> = {};
      while (s.run.phase !== 'gameOver' && rt < MAX_RUN_SECONDS) {
        player.play(s, ev);
        step(s, ev);
        const cur = (lv[s.run.level] ??= { w: 0, b: 0, hits: 0 });
        if (s.run.phase === 'boss') cur.b += STEP; else if (s.run.phase === 'waves') cur.w += STEP;
        cur.hits += ev.filter((e) => e.type === 'cannonHit').length;
        ev.length = 0;
        rt += STEP;
        if (rt - lastBuy > 1) {
          spendCoins(s);
          lastBuy = rt;
        }
      }
      total += rt + MENU_TIME;
      if (runIdx < 3) first.push(s.run.level);
      for (const m of milestones) {
        if (s.meta.bestLevel >= m && !reached.some((r) => r.startsWith(`niv ${m} `))) {
          reached.push(`niv ${m} : ${(total / 3600).toFixed(1)} h (partie ${runIdx + 1})`);
        }
      }
      if (runIdx < 12 || runIdx % 10 === 0) {
        lines.push(
          `${name} partie ${runIdx + 1} départ=${s.run.startLevel} niveau=${s.run.level} durée=${rt.toFixed(0)}s total=${(total / 3600).toFixed(2)}h ` +
            `dia+${s.run.diamondsEarned} gemmes=${s.meta.gems} atelier=${JSON.stringify(s.meta.workshop)} cap=${JSON.stringify(s.meta.abilities)} armes=${JSON.stringify(s.meta.weapons)}`,
        );
      }
      if (s.run.startLevel === 1 && s.run.level > 50 && !coinNote) {
        coinNote = `pièces gagnées niveaux 1-50 ≈ ${s.run.coinsEarned.toExponential(2)} ; reprise au niveau 51 : ${checkpointCoins(51).toExponential(2)}`;
      }
      // SIM_ADS=1 : le joueur regarde la pub « doubler les diamants » après chaque partie.
      if (process.env.SIM_ADS) doubleRunDiamonds(s);
      gains.push(s.run.level - s.run.startLevel);
      if (process.env.SIM_DIAG && (process.env.SIM_DIAG === 'all' || runIdx % 6 === 5)) lines.push(`détail partie ${runIdx + 1} : ` + Object.entries(lv).map(([l, v]) => `${l}:${v.w.toFixed(0)}+${v.b.toFixed(0)}s/${v.hits}`).join(' '));
      runLog.push(`${s.run.startLevel}→${s.run.level}(${Math.round(rt / 60)}m)`);
      if (runIdx % 5 === 4) log(`› ${name} ${(total / 3600).toFixed(1)} h : partie ${runIdx + 1} ${s.run.startLevel}→${s.run.level}, niveau max ${s.meta.bestLevel}`);
      spendMeta(s);
      track();
      // Comme un joueur : reprend au monde le plus avancé, sauf s'il n'y progresse plus.
      let world = worldsUnlocked(s.meta.bestLevel) - 1;
      const recent = gains.slice(-3);
      if (world > 0 && s.run.startLevel === worldStart(world) && recent.length === 3 && recent.every((g) => g < 2)) world--;
      startRun(s, world);
      runIdx++;
    }
    log(
      [
        `=== ${name} : 3 premières parties → niveaux ${first.join(', ')}`,
        ...reached,
        coinNote,
        'parties : ' + runLog.join(' '),
        `meilleur niveau ${s.meta.bestLevel} après ${(total / 3600).toFixed(1)} h et ${runIdx} parties ; succès ${s.meta.achievements.length}/${ACHIEVEMENTS.length}`,
        'déblocages : ' + [...unlocks].sort((a, b) => a[1] - b[1]).map(([k, h]) => `${k} ${h.toFixed(1)} h`).join(' · '),
        'pas encore : ' + [
          ...CANNONS.filter((id) => !s.meta.cannons[id]).map((id) => `canon ${id}`),
          ...WEAPONS.filter((id) => s.meta.weapons[id] === 0).map((id) => `arme ${id}`),
          ...ACHIEVEMENTS.filter((a) => !s.meta.achievements.includes(a.id)).map((a) => a.id),
        ].join(', '),
        ...lines,
      ].join('\n'),
    );
  }, 6 * 3_600_000);
}
