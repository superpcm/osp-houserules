import { requestProgressionMutation } from '../progression/progression-authority.js';
import { ospDialogOptions } from './dialog-theme.js';

/**
 * Skill point distribution dialog — shown when a Thief, Assassin, or Barbarian gains a level.
 *
 * Points are stored in actor flags:
 *   flags['osp-houserules'].pendingSkillPoints  — unspent points waiting for distribution
 */

export const SKILL_POINT_CONFIG = {
  'Thief':     { startPoints: 4, rate: 2,   skills: ['climbSheer', 'listeningAtDoors', 'hideShadows', 'moveSilently', 'findTraps', 'openLocks', 'pickPockets'] },
  'Assassin':  { startPoints: 3, rate: 1.5, skills: ['climbSheer', 'listeningAtDoors', 'hideShadows', 'moveSilently'] },
  'Barbarian': { startPoints: 2, rate: 0.5, skills: ['climbSheer', 'moveSilently', 'hideUndergrowth'] },
};

const SKILL_LABELS = {
  assassination:   'Assassination',
  listeningAtDoors: 'Hear Noise',
  climbSheer:      'Climb Sheer Surfaces',
  hideShadows:     'Hide in Shadows',
  moveSilently:    'Move Silently',
  findTraps:       'Find Traps',
  openLocks:       'Open Locks',
  pickPockets:     'Pick Pockets',
  hideUndergrowth: 'Hide in Undergrowth',
};

const MAX_SKILL = 5;

/**
 * Returns skill points earned going from fromLevel (exclusive) up to toLevel (inclusive).
 * Level 1 awards the class starting pool; subsequent levels use the fractional rate.
 */
export function calcSkillPoints(config, fromLevel, toLevel) {
  const start = Number(config?.startPoints) || 0;
  const rate = Number(config?.rate) || 0;
  const from = Math.max(0, Math.floor(Number(fromLevel) || 0));
  const to = Math.max(from, Math.floor(Number(toLevel) || from));
  return Math.max(0, Math.floor(start + rate * Math.max(0, to - 1)) - (from === 0 ? 0 : Math.floor(start + rate * Math.max(0, from - 1))));
}

export function showSkillPointDialog(actor, totalPending) {
  const cls    = (actor.system.class || '').trim();
  const config = SKILL_POINT_CONFIG[cls];
  if (!config || totalPending <= 0) return;

  const skills = config.skills;

  // Snapshot current values before the dialog opens
  const base = {};
  for (const sk of skills) base[sk] = parseInt(actor.system[sk]) || 1;

  // Mutable dialog state
  const inc = Object.fromEntries(skills.map(sk => [sk, 0]));
  let pool  = totalPending;
  const allocationId = globalThis.foundry?.utils?.randomID?.() || `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // ── Row builder ────────────────────────────────────────────────────────────
  const buildRows = () => skills.map(sk => {
    const cur      = base[sk];
    const delta    = inc[sk];
    const proposed = cur + delta;
    const canInc   = pool > 0 && proposed < MAX_SKILL;
    const canDec   = delta > 0;
    return `
      <tr class="osp-skp-row" data-skill="${sk}">
        <td class="osp-skp-label">${SKILL_LABELS[sk] ?? sk}</td>
        <td class="osp-skp-current">${cur > 0 ? cur + '-in-6' : '—'}</td>
        <td class="osp-skp-ctrl">
          <span role="button" tabindex="0" class="osp-skp-btn osp-skp-dec${canDec ? '' : ' disabled'}" data-skill="${sk}">−</span>
          <span class="osp-skp-delta">${delta > 0 ? `+${delta}` : '·'}</span>
          <span role="button" tabindex="0" class="osp-skp-btn osp-skp-inc${canInc ? '' : ' disabled'}" data-skill="${sk}">+</span>
        </td>
        <td class="osp-skp-new${proposed > cur ? ' osp-skp-raised' : ''}">${proposed > 0 ? proposed + '-in-6' : '—'}</td>
      </tr>`;
  }).join('');

  // ── Initial content ────────────────────────────────────────────────────────
  const content = `
    <div class="osp-skp-dialog">
      <div class="osp-skp-header">
        <span class="osp-skp-header-label">Points to distribute:</span>
        <span class="osp-skp-pool-val">${pool}</span>
        <span role="button" tabindex="0" class="osp-skp-clear-btn"><i class="fas fa-undo"></i> Clear</span>
      </div>
      <table class="osp-skp-table">
        <thead>
          <tr>
            <th class="osp-skp-th-skill">Skill</th>
            <th class="osp-skp-th-cur">Current</th>
            <th class="osp-skp-th-chg">Change</th>
            <th class="osp-skp-th-new">New</th>
          </tr>
        </thead>
        <tbody class="osp-skp-tbody">${buildRows()}</tbody>
      </table>
      <p class="osp-skp-note">Max 5-in-6 per skill. Unspent points are saved for next session.</p>
    </div>`;

  const poolVersion = Number(actor.getFlag?.('osp-houserules', 'skillPoolVersion') || 0);
  let submitting = false;
  new Dialog(ospDialogOptions({
    title: `Skill Points — ${actor.name}`,
    content,
    buttons: {
      ok: {
        icon:  '<i class="fas fa-check"></i>',
        label: 'OK',
        callback: async () => {
          if (submitting) return false;
          submitting = true;
          const spent     = skills.reduce((s, sk) => s + inc[sk], 0);
          const remaining = totalPending - spent;

          const allocation = Object.fromEntries(skills.filter(sk => inc[sk] > 0).map(sk => [sk, inc[sk]]));
          const result = await requestProgressionMutation('skill.allocate', {
            actorId: actor.id,
            allocationId,
            allocation,
            poolVersion
          }, allocationId);
          submitting = false;
          if (!result?.success) {
            ui.notifications.warn(result?.reason || 'Skill allocation could not be committed.');
            return;
          }

          if (spent > 0)
            ui.notifications.info(`${spent} skill point${spent !== 1 ? 's' : ''} distributed for ${actor.name}.`);
          if (remaining > 0)
            ui.notifications.info(`${remaining} unspent point${remaining !== 1 ? 's' : ''} saved for ${actor.name}.`);
        }
      },
      cancel: {
        icon:  '<i class="fas fa-times"></i>',
        label: 'Cancel',
      }
    },
    default: 'ok',
    render: (html) => {
      const refresh = () => {
        html.find('.osp-skp-tbody').html(buildRows());
        html.find('.osp-skp-pool-val').text(pool);
        bind();
      };

      const bind = () => {
        html.find('.osp-skp-inc:not(.disabled)').off('click').on('click', function () {
          const sk = this.dataset.skill;
          if (pool > 0 && (base[sk] + inc[sk]) < MAX_SKILL) { inc[sk]++; pool--; refresh(); }
        });
        html.find('.osp-skp-dec:not(.disabled)').off('click').on('click', function () {
          const sk = this.dataset.skill;
          if (inc[sk] > 0) { inc[sk]--; pool++; refresh(); }
        });
        html.find('.osp-skp-clear-btn').off('click').on('click', () => {
          for (const sk of skills) inc[sk] = 0;
          pool = totalPending;
          refresh();
        });
      };

      bind();
    }
  })).render(true);
}
