import { calculateXPModifier, getNextLevelXP } from "../../../../config/classes.js";

/**
 * XPProgressHandler - Manages XP progress bar functionality
 */
export class XPProgressHandler {
  constructor(html, actor, sheet) {
    this.html = html;
    this.actor = actor;
    this.sheet = sheet;
  }

  initialize() {
    this.levelXpProgress = this.html.find('.level-xp-progress');
    this.percentageDisplay = this.html.find('.xp-percentage');
    this.xpDisplay = this.html.find('.xp-display');
    this.nextLevelDisplay = this.html.find('.next-level-xp');
    this.nextLevelFormDisplay = this.html.find('.next-level-display');
    this.levelDisplay = this.html.find('.char-level-display');
    this.skillsLevelProgressRing = this.html.find('.skills-level-progress-ring');
    this.skillsLevelDisplay = this.html.find('.skills-level-display');
    this.staticLevelDisplay = this.html.find('.level-display');
    this.staticLevelProgressBar = this.html.find('.level-progress-bar');

    this.bindEvents();

    setTimeout(() => {
      this.refreshElements();
      this.updateProgressBar();
    }, 250);
  }

  refreshElements() {
    this.levelXpProgress = this.html.find('.level-xp-progress');
    this.percentageDisplay = this.html.find('.xp-percentage');
    this.xpDisplay = this.html.find('.xp-display');
    this.nextLevelDisplay = this.html.find('.next-level-xp');
    this.nextLevelFormDisplay = this.html.find('.next-level-display');
    this.levelDisplay = this.html.find('.char-level-display');
    this.skillsLevelProgressRing = this.html.find('.skills-level-progress-ring');
    this.skillsLevelDisplay = this.html.find('.skills-level-display');
    this.staticLevelDisplay = this.html.find('.level-display');
    this.staticLevelProgressRing = this.html.find('.level-progress-ring');
  }

  bindEvents() {
    this.html.on('xpChanged', () => {
      this.updateProgressBar();
    });

    this.html.on('change', '.char-xp', () => {
      setTimeout(() => this.updateProgressBar(), 50);
    });

    if (this.actor) {
      this.actor.on?.('update', (actor, updateData) => {
        if (this.sheet && this.sheet._ignoringRaceChange) return;

        const xpChanged = updateData.system?.xp !== undefined;
        const levelChanged = updateData.system?.level !== undefined;
        const classChanged = updateData.system?.class !== undefined;

        if (!xpChanged && !levelChanged && !classChanged) return;

        let skipXPUpdate = false;
        if (xpChanged && this.xpDisplay.length) {
          this.xpDisplay.val(updateData.system.xp);
          skipXPUpdate = true;
        }

        setTimeout(() => this.updateProgressBar(skipXPUpdate), 10);
      });
    }

    this.html.on('change', 'input[name="system.xp"]', () => {
      setTimeout(() => this.updateProgressBar(), 50);
    });
  }

  getXPModifier() {
    const characterClass = this.actor.system.class || '';
    const attributes = this.actor.system.attributes || {};
    return calculateXPModifier(characterClass, attributes);
  }

  updateProgressBar(skipXPDisplayUpdate = false) {
    const currentXP = parseInt(String(this.actor.system.xp).replace(/,/g, '')) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();

    let progressPercentage = 0;
    if (nextLevelXP > currentLevelXP && nextLevelXP > 0 && currentLevelXP >= 0) {
      const xpInCurrentLevel = currentXP - currentLevelXP;
      const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
      if (xpNeededForNextLevel > 0) {
        progressPercentage = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNextLevel) * 100));
      }
    }

    if (this.levelXpProgress.length) {
      try {
        this.levelXpProgress[0].style.setProperty('--xp-progress-width', `${progressPercentage}%`);
      } catch (e) {
        if (this.levelXpProgress[0]) this.levelXpProgress[0].style.width = `${progressPercentage}%`;
      }
    }

    if (this.nextLevelDisplay.length) {
      this.nextLevelDisplay.text(nextLevelXP);
    }

    if (this.nextLevelFormDisplay.length) {
      this.nextLevelFormDisplay.val(nextLevelXP);
    }

    if (this.levelDisplay.length) {
      this.levelDisplay.text(this.actor.system.level || 1);
    }

    if (this.percentageDisplay.length) {
      this.percentageDisplay.text(Math.round(progressPercentage) + '%');
    }

    if (this.xpDisplay.length && !skipXPDisplayUpdate) {
      this.xpDisplay.val(currentXP);
    }

    if (this.skillsLevelProgressRing.length) {
      const circumference = 2 * Math.PI * 32.5;
      const offset = circumference - (progressPercentage / 100) * circumference;
      try {
        this.skillsLevelProgressRing[0].setAttribute('stroke-dashoffset', String(offset));
      } catch (e) {
        if (this.skillsLevelProgressRing[0]) this.skillsLevelProgressRing[0].style.strokeDashoffset = offset;
      }
    }

    if (this.skillsLevelDisplay.length) {
      this.skillsLevelDisplay.text(this.actor.system.level || 1);
    }

    if (this.staticLevelProgressBar.length) {
      try {
        this.staticLevelProgressBar[0].style.setProperty('--static-level-width', `${progressPercentage}%`);
      } catch (e) {
        if (this.staticLevelProgressBar[0]) this.staticLevelProgressBar[0].style.width = `${progressPercentage}%`;
      }
    }

    if (this.staticLevelDisplay.length) {
      this.staticLevelDisplay.text(this.actor.system.level || 1);
    }
  }

  getNextLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    return getNextLevelXP(characterClass, currentLevel);
  }

  getCurrentLevelXP() {
    const characterClass = this.actor.system.class;
    const currentLevel = parseInt(this.actor.system.level) || 1;
    return currentLevel > 1 ? getNextLevelXP(characterClass, currentLevel - 1) : 0;
  }

  getProgressInfo() {
    const currentXP = parseInt(this.actor.system.xp) || 0;
    const nextLevelXP = this.getNextLevelXP();
    const currentLevelXP = this.getCurrentLevelXP();
    return {
      currentXP,
      nextLevelXP,
      currentLevelXP,
      progressPercentage: Math.min(100, Math.max(0, ((currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100))
    };
  }

  refresh() {
    this.updateProgressBar();
  }

  destroy() {
    if (this.html) {
      this.html.off('xpChanged');
    }
  }
}
