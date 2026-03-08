/* 역할: 1차 스탯(STR/DEX/VIT/INT/LUK), 히든 스탯, 레벨업 성장 규칙을 담당한다. */

(function attachStatsService(global) {
  const PRIMARY_STATS = ["str", "dex", "vit", "int", "luk"];
  const PRIMARY_STAT_LABELS = {
    str: "STR",
    dex: "DEX",
    vit: "VIT",
    int: "INT",
    luk: "LUK"
  };
  const PRIMARY_STAT_DESCRIPTIONS = {
    str: "물리 공격력의 핵심. 체력과 방어에도 소폭 영향을 준다.",
    dex: "명중과 속도의 핵심. 회피와 크리티컬 안정성에도 관여한다.",
    vit: "체력과 방어의 핵심. 전열 유지력을 크게 끌어올린다.",
    int: "스킬 위력과 정밀도의 핵심. 보조 기술 성능을 높인다.",
    luk: "크리티컬과 전리품 운의 핵심. 드롭률과 치명타 효율이 오른다."
  };
  const PRIMARY_STAT_LIMITS = {
    str: 99,
    dex: 99,
    vit: 99,
    int: 99,
    luk: 99
  };

  const CLASS_GROWTH_WEIGHTS = {
    로드: { str: 1.15, dex: 1.0, vit: 1.1, int: 0.75, luk: 1.0 },
    하이로드: { str: 1.15, dex: 1.05, vit: 1.05, int: 0.8, luk: 0.95 },
    클레릭: { str: 0.5, dex: 0.8, vit: 0.82, int: 1.55, luk: 1.08 },
    비숍: { str: 0.58, dex: 0.85, vit: 0.88, int: 1.65, luk: 1.1 },
    랜서: { str: 0.95, dex: 0.8, vit: 1.45, int: 0.55, luk: 0.65 },
    팔라딘: { str: 1.0, dex: 0.85, vit: 1.35, int: 0.55, luk: 0.65 },
    아처: { str: 0.75, dex: 1.45, vit: 0.8, int: 0.7, luk: 1.15 },
    스나이퍼: { str: 0.8, dex: 1.5, vit: 0.8, int: 0.75, luk: 1.15 },
    검사: { str: 1.0, dex: 1.35, vit: 0.82, int: 0.65, luk: 1.05 },
    브리건드: { str: 1.65, dex: 0.75, vit: 1.15, int: 0.35, luk: 0.6 },
    헌터: { str: 0.82, dex: 1.3, vit: 0.82, int: 0.7, luk: 1.2 },
    솔저: { str: 0.95, dex: 0.92, vit: 1.2, int: 0.55, luk: 0.7 }
  };

  const CLASS_DERIVED_MODIFIERS = {
    로드: { hp: 1, attack: 0.4, accuracy: 0.2, speed: 0.15, defense: 0.05, mov: 5, crit: 1, skill: 0.1 },
    하이로드: { hp: 2, attack: 0.55, accuracy: 0.25, speed: 0.25, defense: 0.1, mov: 6, crit: 2, skill: 0.15 },
    클레릭: { hp: -1, attack: -0.2, accuracy: 0.35, speed: 0.08, defense: -0.1, mov: 5, crit: 1, skill: 0.72 },
    비숍: { hp: 0, attack: -0.05, accuracy: 0.42, speed: 0.12, defense: -0.02, mov: 5, crit: 2, skill: 0.9 },
    랜서: { hp: 3, attack: 0.15, accuracy: -0.05, speed: -0.1, defense: 0.55, mov: 4, crit: 0, skill: 0.05 },
    팔라딘: { hp: 3, attack: 0.2, accuracy: 0, speed: -0.05, defense: 0.65, mov: 5, crit: 0, skill: 0.05 },
    아처: { hp: -1, attack: 0, accuracy: 0.7, speed: 0.45, defense: -0.15, mov: 5, crit: 3, skill: 0.2 },
    스나이퍼: { hp: 0, attack: 0.2, accuracy: 0.85, speed: 0.5, defense: -0.05, mov: 5, crit: 5, skill: 0.3 },
    검사: { hp: 0, attack: 0.3, accuracy: 0.45, speed: 0.55, defense: -0.1, mov: 5, crit: 3, skill: 0.1 },
    브리건드: { hp: 2, attack: 0.8, accuracy: -0.25, speed: -0.15, defense: 0.15, mov: 4, crit: 1, skill: -0.05 },
    헌터: { hp: 0, attack: 0.1, accuracy: 0.65, speed: 0.35, defense: -0.1, mov: 5, crit: 3, skill: 0.15 },
    솔저: { hp: 1, attack: 0.15, accuracy: 0.1, speed: 0, defense: 0.35, mov: 5, crit: 0, skill: 0.05 }
  };

  Object.assign(CLASS_GROWTH_WEIGHTS, {
    블레이드로드: { str: 1.2, dex: 1.18, vit: 0.92, int: 0.72, luk: 1.02 },
    소드마스터: { str: 1.02, dex: 1.5, vit: 0.78, int: 0.66, luk: 1.15 },
    엠퍼러: { str: 1.24, dex: 1.12, vit: 1.08, int: 0.82, luk: 1.0 },
    검성: { str: 1.08, dex: 1.6, vit: 0.8, int: 0.72, luk: 1.18 },
    오버로드: { str: 1.3, dex: 1.16, vit: 1.12, int: 0.86, luk: 1.04 },
    스타블레이드: { str: 1.12, dex: 1.68, vit: 0.82, int: 0.78, luk: 1.2 },
    가디언: { str: 0.9, dex: 0.72, vit: 1.62, int: 0.42, luk: 0.58 },
    센티넬: { str: 0.94, dex: 0.88, vit: 1.34, int: 0.5, luk: 0.7 },
    홀리랜서: { str: 1.04, dex: 0.92, vit: 1.28, int: 0.62, luk: 0.78 },
    포트리스: { str: 0.92, dex: 0.7, vit: 1.72, int: 0.4, luk: 0.56 },
    아크랜서: { str: 1.08, dex: 0.96, vit: 1.34, int: 0.7, luk: 0.82 },
    이지스로드: { str: 0.98, dex: 0.74, vit: 1.82, int: 0.45, luk: 0.6 },
    레인저: { str: 0.86, dex: 1.48, vit: 0.82, int: 0.76, luk: 1.18 },
    트래퍼: { str: 0.82, dex: 1.38, vit: 0.8, int: 0.78, luk: 1.22 },
    호크아이: { str: 0.92, dex: 1.62, vit: 0.86, int: 0.82, luk: 1.2 },
    그림트래퍼: { str: 0.88, dex: 1.48, vit: 0.82, int: 0.84, luk: 1.26 },
    천궁성: { str: 0.98, dex: 1.72, vit: 0.88, int: 0.86, luk: 1.26 },
    나이트메어헌트: { str: 0.92, dex: 1.58, vit: 0.84, int: 0.88, luk: 1.3 },
    버서커: { str: 1.82, dex: 0.68, vit: 1.18, int: 0.28, luk: 0.56 },
    워브레이커: { str: 1.56, dex: 0.74, vit: 1.26, int: 0.34, luk: 0.58 },
    데스브링어: { str: 1.92, dex: 0.7, vit: 1.24, int: 0.3, luk: 0.58 },
    월드이터: { str: 2.02, dex: 0.72, vit: 1.3, int: 0.32, luk: 0.6 },
    오라클: { str: 0.62, dex: 0.92, vit: 0.86, int: 1.48, luk: 1.16 },
    세라핌: { str: 0.66, dex: 0.96, vit: 0.92, int: 1.72, luk: 1.18 },
    인퀴지터: { str: 0.78, dex: 0.98, vit: 0.9, int: 1.62, luk: 1.12 },
    성녀: { str: 0.7, dex: 1.0, vit: 0.98, int: 1.82, luk: 1.2 },
    아크저지: { str: 0.84, dex: 1.02, vit: 0.94, int: 1.72, luk: 1.16 }
  });

  Object.assign(CLASS_DERIVED_MODIFIERS, {
    블레이드로드: { hp: 1, attack: 0.6, accuracy: 0.34, speed: 0.34, defense: 0, mov: 6, crit: 3, skill: 0.16 },
    소드마스터: { hp: 0, attack: 0.42, accuracy: 0.56, speed: 0.66, defense: -0.12, mov: 6, crit: 5, skill: 0.16 },
    엠퍼러: { hp: 2, attack: 0.7, accuracy: 0.32, speed: 0.26, defense: 0.16, mov: 6, crit: 3, skill: 0.18 },
    검성: { hp: 1, attack: 0.48, accuracy: 0.66, speed: 0.76, defense: -0.08, mov: 6, crit: 6, skill: 0.18 },
    오버로드: { hp: 3, attack: 0.82, accuracy: 0.36, speed: 0.28, defense: 0.2, mov: 6, crit: 4, skill: 0.2 },
    스타블레이드: { hp: 1, attack: 0.56, accuracy: 0.72, speed: 0.82, defense: -0.05, mov: 6, crit: 7, skill: 0.22 },
    가디언: { hp: 4, attack: 0.1, accuracy: -0.08, speed: -0.14, defense: 0.78, mov: 4, crit: 0, skill: 0.02 },
    센티넬: { hp: 2, attack: 0.18, accuracy: 0.06, speed: -0.02, defense: 0.48, mov: 5, crit: 1, skill: 0.06 },
    홀리랜서: { hp: 3, attack: 0.26, accuracy: 0.1, speed: 0.02, defense: 0.58, mov: 6, crit: 1, skill: 0.1 },
    포트리스: { hp: 5, attack: 0.08, accuracy: -0.1, speed: -0.18, defense: 0.92, mov: 4, crit: 0, skill: 0.02 },
    아크랜서: { hp: 4, attack: 0.34, accuracy: 0.12, speed: 0.04, defense: 0.66, mov: 6, crit: 2, skill: 0.12 },
    이지스로드: { hp: 6, attack: 0.1, accuracy: -0.08, speed: -0.2, defense: 1.04, mov: 4, crit: 0, skill: 0.02 },
    레인저: { hp: 0, attack: 0.16, accuracy: 0.78, speed: 0.48, defense: -0.08, mov: 6, crit: 4, skill: 0.2 },
    트래퍼: { hp: 0, attack: 0.12, accuracy: 0.72, speed: 0.44, defense: -0.08, mov: 6, crit: 4, skill: 0.2 },
    호크아이: { hp: 1, attack: 0.24, accuracy: 0.96, speed: 0.56, defense: -0.04, mov: 6, crit: 6, skill: 0.28 },
    그림트래퍼: { hp: 1, attack: 0.22, accuracy: 0.84, speed: 0.52, defense: -0.04, mov: 6, crit: 5, skill: 0.24 },
    천궁성: { hp: 2, attack: 0.3, accuracy: 1.02, speed: 0.6, defense: 0, mov: 6, crit: 7, skill: 0.32 },
    나이트메어헌트: { hp: 2, attack: 0.28, accuracy: 0.9, speed: 0.58, defense: -0.02, mov: 6, crit: 6, skill: 0.28 },
    버서커: { hp: 3, attack: 0.98, accuracy: -0.3, speed: -0.12, defense: 0.18, mov: 5, crit: 2, skill: -0.08 },
    워브레이커: { hp: 3, attack: 0.88, accuracy: -0.18, speed: -0.08, defense: 0.24, mov: 5, crit: 1, skill: -0.04 },
    데스브링어: { hp: 4, attack: 1.06, accuracy: -0.26, speed: -0.1, defense: 0.24, mov: 5, crit: 3, skill: -0.06 },
    월드이터: { hp: 5, attack: 1.14, accuracy: -0.22, speed: -0.06, defense: 0.28, mov: 5, crit: 3, skill: -0.02 },
    오라클: { hp: 0, attack: -0.02, accuracy: 0.48, speed: 0.12, defense: -0.04, mov: 5, crit: 2, skill: 0.92 },
    세라핌: { hp: 1, attack: 0, accuracy: 0.44, speed: 0.16, defense: 0, mov: 5, crit: 2, skill: 1.02 },
    인퀴지터: { hp: 1, attack: 0.12, accuracy: 0.52, speed: 0.16, defense: -0.02, mov: 5, crit: 3, skill: 0.98 },
    성녀: { hp: 2, attack: 0.04, accuracy: 0.48, speed: 0.18, defense: 0.04, mov: 5, crit: 3, skill: 1.1 },
    아크저지: { hp: 2, attack: 0.18, accuracy: 0.56, speed: 0.2, defense: 0, mov: 5, crit: 4, skill: 1.06 }
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getUnitById(saveData, unitId) {
    return (saveData.roster || []).find((unit) => unit.id === unitId) || null;
  }

  function getPrimaryStatLabels() {
    return Object.assign({}, PRIMARY_STAT_LABELS);
  }

  function getPrimaryStatDescription(statName) {
    return PRIMARY_STAT_DESCRIPTIONS[statName] || "";
  }

  function getClassGrowthWeights(className) {
    return CLASS_GROWTH_WEIGHTS[className] || CLASS_GROWTH_WEIGHTS.로드;
  }

  function getClassDerivedModifiers(className) {
    return CLASS_DERIVED_MODIFIERS[className] || CLASS_DERIVED_MODIFIERS.로드;
  }

  function buildPrimaryStats(strValue, dexValue, vitValue, intValue, lukValue) {
    return {
      str: clamp(Math.round(strValue || 1), 1, PRIMARY_STAT_LIMITS.str),
      dex: clamp(Math.round(dexValue || 1), 1, PRIMARY_STAT_LIMITS.dex),
      vit: clamp(Math.round(vitValue || 1), 1, PRIMARY_STAT_LIMITS.vit),
      int: clamp(Math.round(intValue || 1), 1, PRIMARY_STAT_LIMITS.int),
      luk: clamp(Math.round(lukValue || 1), 1, PRIMARY_STAT_LIMITS.luk)
    };
  }

  function derivePrimaryStatsFromLegacy(unit) {
    const legacyMaxHp = Number(unit.maxHp || 12);
    const legacyAttack = Number(unit.str || 4);
    const legacySkill = Number(unit.skl || 4);
    const legacySpeed = Number(unit.spd || 4);
    const legacyDefense = Number(unit.def || 3);
    const level = Math.max(1, Number(unit.level || 1));

    return buildPrimaryStats(
      legacyAttack * 0.9 + legacyDefense * 0.25 + level * 0.15,
      legacySkill * 0.7 + legacySpeed * 0.55,
      ((legacyMaxHp - 8) / 2.4) + legacyDefense * 0.45,
      legacySkill * 0.28 + legacyDefense * 0.12 + level * 0.2,
      legacySpeed * 0.35 + legacySkill * 0.18 + level * 0.15
    );
  }

  function computeDerivedStats(unit) {
    const primary = clone(unit.primaryStats || derivePrimaryStatsFromLegacy(unit));
    const modifiers = getClassDerivedModifiers(unit.className);
    const maxHp = Math.round(10 + primary.vit * 2.6 + primary.str * 0.65 + primary.int * 0.18 + modifiers.hp);
    const attack = Math.round(1 + primary.str * 1.1 + primary.vit * 0.22 + primary.luk * 0.06 + modifiers.attack);
    const skill = Math.round(1 + primary.dex * 1.02 + primary.int * 0.46 + primary.luk * 0.24 + modifiers.accuracy);
    const speed = Math.round(1 + primary.dex * 0.84 + primary.luk * 0.28 + primary.int * 0.12 + modifiers.speed);
    const defense = Math.round(primary.vit * 0.86 + primary.str * 0.26 + primary.int * 0.14 + modifiers.defense);
    const move = clamp(
      Math.round(modifiers.mov + Math.floor((primary.dex + primary.luk) / 30)),
      4,
      8
    );
    const hiddenStats = {
      physicalAttack: Math.round(4 + primary.str * 1.35 + primary.dex * 0.15 + primary.vit * 0.25 + modifiers.attack),
      skillPower: Math.round(2 + primary.int * 1.2 + primary.dex * 0.25 + primary.luk * 0.15 + modifiers.skill),
      healPower: Math.round(1 + primary.int * 0.95 + primary.luk * 0.22 + modifiers.skill * 0.6),
      accuracy: Math.round(40 + primary.dex * 4 + primary.luk * 1.4 + primary.int * 1.2 + modifiers.accuracy * 8),
      evasion: Math.round(10 + primary.dex * 2.8 + primary.luk * 1.6 + modifiers.speed * 10),
      physicalDefense: Math.round(1 + primary.vit * 1.05 + primary.str * 0.35 + primary.int * 0.18 + modifiers.defense * 6),
      critChance: clamp(Math.round(2 + primary.dex * 0.35 + primary.luk * 0.9 + modifiers.crit), 0, 65),
      critMultiplier: Number((1.5 + Math.min(0.75, primary.luk * 0.012 + primary.int * 0.006)).toFixed(2)),
      dropRateBonus: Number(Math.min(0.45, primary.luk * 0.012).toFixed(3))
    };

    return {
      primaryStats: primary,
      maxHp: Math.max(8, maxHp),
      str: Math.max(1, attack),
      skl: Math.max(1, skill),
      spd: Math.max(1, speed),
      def: Math.max(0, defense),
      mov: move,
      hiddenStats
    };
  }

  function recalculateUnitStats(unit, options) {
    if (!unit) {
      return unit;
    }

    const nextOptions = options || {};
    const previousMaxHp = Number(unit.maxHp || 0);
    const previousHp = Number(unit.hp || 0);
    const derived = computeDerivedStats(unit);

    unit.primaryStats = derived.primaryStats;
    unit.maxHp = derived.maxHp;
    unit.str = derived.str;
    unit.skl = derived.skl;
    unit.spd = derived.spd;
    unit.def = derived.def;
    unit.mov = derived.mov;
    unit.hiddenStats = derived.hiddenStats;

    if (nextOptions.keepHpFull || previousMaxHp <= 0) {
      unit.hp = unit.maxHp;
      return unit;
    }

    const hpRatio = previousMaxHp > 0 ? previousHp / previousMaxHp : 1;
    unit.hp = clamp(Math.round(unit.maxHp * hpRatio), 1, unit.maxHp);
    return unit;
  }

  function normalizeUnitProgression(unit) {
    if (!unit) {
      return unit;
    }

    if (!unit.primaryStats) {
      unit.primaryStats = derivePrimaryStatsFromLegacy(unit);
    } else {
      unit.primaryStats = buildPrimaryStats(
        unit.primaryStats.str,
        unit.primaryStats.dex,
        unit.primaryStats.vit,
        unit.primaryStats.int,
        unit.primaryStats.luk
      );
    }

    unit.statPoints = Math.max(0, Number(unit.statPoints || 0));
    unit.skillPoints = Math.max(0, Number(unit.skillPoints || 0));
    recalculateUnitStats(unit, { keepHpFull: !unit.hp || unit.hp >= unit.maxHp });
    return unit;
  }

  function normalizeRosterProgression(saveData) {
    if (!saveData || !saveData.roster) {
      return saveData;
    }

    saveData.roster.forEach((unit) => normalizeUnitProgression(unit));
    return saveData;
  }

  function createEmptyGrowth() {
    return {
      str: 0,
      dex: 0,
      vit: 0,
      int: 0,
      luk: 0
    };
  }

  function rollWeightedPrimaryStat(className) {
    const weights = getClassGrowthWeights(className);
    const totalWeight = PRIMARY_STATS.reduce((sum, statName) => sum + (weights[statName] || 0), 0);
    let roll = Math.random() * totalWeight;

    for (let index = 0; index < PRIMARY_STATS.length; index += 1) {
      const statName = PRIMARY_STATS[index];
      roll -= weights[statName] || 0;

      if (roll <= 0) {
        return statName;
      }
    }

    return PRIMARY_STATS[0];
  }

  function rollLevelGains(unit, totalPoints) {
    const growth = createEmptyGrowth();
    const budget = Math.max(1, Number(totalPoints || 5));

    for (let index = 0; index < budget; index += 1) {
      const statName = rollWeightedPrimaryStat(unit.className);
      growth[statName] += 1;
    }

    return growth;
  }

  function applyLevelGains(unit, gains) {
    if (!unit) {
      return unit;
    }

    PRIMARY_STATS.forEach((statName) => {
      unit.primaryStats[statName] = clamp(
        (unit.primaryStats[statName] || 1) + Number((gains && gains[statName]) || 0),
        1,
        PRIMARY_STAT_LIMITS[statName]
      );
    });

    recalculateUnitStats(unit, { keepHpFull: true });
    return unit;
  }

  function getPrimaryStats(unit) {
    return clone(unit && unit.primaryStats ? unit.primaryStats : createEmptyGrowth());
  }

  function previewUnitWithStatDraft(unit, draft) {
    const previewUnit = clone(unit);
    const pending = draft || {};

    normalizeUnitProgression(previewUnit);
    PRIMARY_STATS.forEach((statName) => {
      previewUnit.primaryStats[statName] = clamp(
        previewUnit.primaryStats[statName] + Number(pending[statName] || 0),
        1,
        PRIMARY_STAT_LIMITS[statName]
      );
    });
    recalculateUnitStats(previewUnit, { keepHpFull: previewUnit.hp >= previewUnit.maxHp });
    return previewUnit;
  }

  function allocateStatPoint(saveData, unitId, statName) {
    const unit = getUnitById(saveData, unitId);

    if (!unit) {
      throw new Error("스탯을 올릴 유닛을 찾을 수 없습니다.");
    }

    if (!PRIMARY_STATS.includes(statName)) {
      throw new Error("분배할 수 없는 스탯입니다.");
    }

    if ((unit.statPoints || 0) <= 0) {
      throw new Error("남은 스탯 포인트가 없습니다.");
    }

    const limit = PRIMARY_STAT_LIMITS[statName];

    if ((unit.primaryStats[statName] || 0) >= limit) {
      throw new Error("이 스탯은 더 이상 올릴 수 없습니다.");
    }

    unit.primaryStats[statName] += 1;
    unit.statPoints -= 1;
    recalculateUnitStats(unit, { keepHpFull: unit.hp >= unit.maxHp });
    return unit;
  }

  function applyStatDraft(saveData, unitId, draft) {
    const unit = getUnitById(saveData, unitId);
    const pending = draft || {};
    const totalSpent = PRIMARY_STATS.reduce((sum, statName) => sum + Number(pending[statName] || 0), 0);

    if (!unit) {
      throw new Error("스탯을 올릴 유닛을 찾을 수 없습니다.");
    }

    if (totalSpent <= 0) {
      return unit;
    }

    if ((unit.statPoints || 0) < totalSpent) {
      throw new Error("남은 스탯 포인트가 부족합니다.");
    }

    PRIMARY_STATS.forEach((statName) => {
      const nextValue = (unit.primaryStats[statName] || 0) + Number(pending[statName] || 0);

      if (nextValue > PRIMARY_STAT_LIMITS[statName]) {
        throw new Error(`${PRIMARY_STAT_LABELS[statName]}은(는) 더 이상 올릴 수 없습니다.`);
      }
    });

    PRIMARY_STATS.forEach((statName) => {
      unit.primaryStats[statName] += Number(pending[statName] || 0);
    });
    unit.statPoints -= totalSpent;
    recalculateUnitStats(unit, { keepHpFull: unit.hp >= unit.maxHp });
    return unit;
  }

  function describeLevelGains(gains) {
    return PRIMARY_STATS
      .filter((statName) => gains && gains[statName])
      .map((statName) => `${PRIMARY_STAT_LABELS[statName]}+${gains[statName]}`)
      .join(" ");
  }

  global.StatsService = {
    PRIMARY_STATS,
    PRIMARY_STAT_LABELS,
    PRIMARY_STAT_DESCRIPTIONS,
    ALLOCATABLE_STATS: PRIMARY_STATS,
    STAT_LIMITS: PRIMARY_STAT_LIMITS,
    getUnitById,
    getPrimaryStatLabels,
    getPrimaryStatDescription,
    getPrimaryStats,
    getClassGrowthWeights,
    derivePrimaryStatsFromLegacy,
    computeDerivedStats,
    recalculateUnitStats,
    normalizeUnitProgression,
    normalizeRosterProgression,
    rollLevelGains,
    applyLevelGains,
    previewUnitWithStatDraft,
    allocateStatPoint,
    applyStatDraft,
    describeLevelGains
  };
})(window);
