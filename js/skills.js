/* 역할: 클래스별 패시브 스킬, 해금 레벨, 성장률을 정의하고 전투/레벨업 보조 함수를 제공한다. */

(function attachSkillsService(global) {
  const CLASS_SKILLS = {
    로드: [
      {
        id: "vanguard",
        name: "선봉",
        description: "HP가 절반 이상일 때 선공 명중 +10",
        unlockLevel: 1,
        attackerEffect(context) {
          if (context.attacker.hp >= Math.ceil(context.attacker.maxHp / 2) && context.isInitiator) {
            return { hitBonus: 10 };
          }

          return null;
        }
      },
      {
        id: "royal_drive",
        name: "왕실의 기세",
        description: "선공 시 피해 +2",
        unlockLevel: 3,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 2 } : null;
        }
      }
    ],
    하이로드: [
      {
        id: "regal_aura",
        name: "왕가의 위광",
        description: "선공 시 명중 +10, 피해 +2",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { hitBonus: 10, attackPowerBonus: 2 } : null;
        }
      },
      {
        id: "guardian_command",
        name: "호위 지휘",
        description: "체력이 절반 이상일 때 방어 +2",
        unlockLevel: 1,
        defenderEffect(context) {
          return context.defender.hp >= Math.ceil(context.defender.maxHp / 2) ? { defenseBonus: 2 } : null;
        }
      }
    ],
    랜서: [
      {
        id: "brace",
        name: "수비 태세",
        description: "인접 공격을 방어할 때 방어 +2",
        unlockLevel: 1,
        defenderEffect(context) {
          return context.distance === 1 ? { defenseBonus: 2 } : null;
        }
      },
      {
        id: "steady_point",
        name: "정중앙 돌파",
        description: "명중 +6",
        unlockLevel: 4,
        attackerEffect() {
          return { hitBonus: 6 };
        }
      }
    ],
    팔라딘: [
      {
        id: "fortress_charge",
        name: "요새 돌격",
        description: "선공 시 피해 +2, 방어 +1",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 2, defenseBonus: 1 } : null;
        }
      },
      {
        id: "steady_guard",
        name: "철기 수호",
        description: "인접 공격을 방어할 때 방어 +3",
        unlockLevel: 1,
        defenderEffect(context) {
          return context.distance === 1 ? { defenseBonus: 3 } : null;
        }
      }
    ],
    아처: [
      {
        id: "eagle_eye",
        name: "매의 눈",
        description: "최대 사거리에서 공격 시 명중 +12",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.weapon && context.distance === context.weapon.rangeMax ? { hitBonus: 12 } : null;
        }
      },
      {
        id: "finish_shot",
        name: "마무리 사격",
        description: "체력이 절반 이하인 대상에게 피해 +2",
        unlockLevel: 3,
        attackerEffect(context) {
          return context.defender.hp <= Math.ceil(context.defender.maxHp / 2) ? { attackPowerBonus: 2 } : null;
        }
      }
    ],
    스나이퍼: [
      {
        id: "deadeye",
        name: "정조준",
        description: "원거리 공격 시 명중 +15",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.distance >= 2 ? { hitBonus: 15 } : null;
        }
      },
      {
        id: "piercing_focus",
        name: "관통 집중",
        description: "체력이 절반 이하인 적에게 피해 +3",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.defender.hp <= Math.ceil(context.defender.maxHp / 2) ? { attackPowerBonus: 3 } : null;
        }
      }
    ],
    검사: [
      {
        id: "duel_focus",
        name: "결투 집중",
        description: "명중 +5",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 5 };
        }
      }
    ],
    브리건드: [
      {
        id: "savage_blow",
        name: "야수의 일격",
        description: "선공 시 피해 +1",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 1 } : null;
        }
      }
    ],
    헌터: [
      {
        id: "lurking_shot",
        name: "잠복 사격",
        description: "숲에서 공격 시 명중 +10",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.attackerTileType === "forest" ? { hitBonus: 10 } : null;
        }
      }
    ],
    솔저: [
      {
        id: "shield_wall",
        name: "방패벽",
        description: "방어 시 방어 +1",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 1 };
        }
      }
    ]
  };

  const CLASS_ACTIVE_SKILLS = {
    로드: [
      {
        id: "rally_heal",
        name: "전장의 기원",
        description: "사거리 1의 아군 1명을 8 회복한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "ally",
        rangeMin: 1,
        rangeMax: 1,
        effect: {
          kind: "heal",
          amount: 8
        }
      }
    ],
    하이로드: [
      {
        id: "royal_recovery",
        name: "왕가의 회복",
        description: "사거리 1의 아군 1명을 12 회복한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "ally",
        rangeMin: 1,
        rangeMax: 1,
        effect: {
          kind: "heal",
          amount: 12
        }
      }
    ],
    랜서: [
      {
        id: "iron_wall",
        name: "철벽 자세",
        description: "자신의 방어를 다음 적 턴까지 3 높인다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "self",
        rangeMin: 0,
        rangeMax: 0,
        effect: {
          kind: "buff",
          buff: {
            id: "iron_wall_buff",
            name: "철벽 자세",
            defenseBonus: 3,
            remainingOwnPhases: 1
          }
        }
      }
    ],
    팔라딘: [
      {
        id: "phalanx_stance",
        name: "팔랑크스",
        description: "자신의 방어를 다음 적 턴까지 4 높인다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "self",
        rangeMin: 0,
        rangeMax: 0,
        effect: {
          kind: "buff",
          buff: {
            id: "phalanx_stance_buff",
            name: "팔랑크스",
            defenseBonus: 4,
            remainingOwnPhases: 1
          }
        }
      }
    ],
    아처: [
      {
        id: "precision_shot",
        name: "집중 사격",
        description: "사거리 내 적 1명에게 명중 +20, 피해 +3의 특수 공격을 가한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "enemy",
        useWeaponRange: true,
        effect: {
          kind: "attack",
          hitBonus: 20,
          damageBonus: 3
        }
      }
    ],
    스나이퍼: [
      {
        id: "piercing_shot",
        name: "관통 사격",
        description: "사거리 내 적 1명에게 명중 +18, 피해 +5의 특수 공격을 가한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "enemy",
        useWeaponRange: true,
        effect: {
          kind: "attack",
          hitBonus: 18,
          damageBonus: 5
        }
      }
    ]
  };

  CLASS_ACTIVE_SKILLS.검사 = [
    {
      id: "cross_slash",
      name: "십자 베기",
      description: "인접 적 1명에게 명중 +12, 피해 +2의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: {
        kind: "attack",
        hitBonus: 12,
        damageBonus: 2
      }
    }
  ];

  CLASS_ACTIVE_SKILLS.브리건드 = [
    {
      id: "berserk_roar",
      name: "광전사의 포효",
      description: "자신의 공격을 다음 턴까지 3 높인다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "self",
      rangeMin: 0,
      rangeMax: 0,
      effect: {
        kind: "buff",
        buff: {
          id: "berserk_roar_buff",
          name: "광전사의 포효",
          attackPowerBonus: 3,
          remainingOwnPhases: 1
        }
      }
    }
  ];

  CLASS_ACTIVE_SKILLS.헌터 = [
    {
      id: "suppression_shot",
      name: "견제 사격",
      description: "사거리 내 적 1명에게 명중 +16, 피해 +2의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: {
        kind: "attack",
        hitBonus: 16,
        damageBonus: 2
      }
    }
  ];

  CLASS_ACTIVE_SKILLS.솔저 = [
    {
      id: "shield_formation",
      name: "방진",
      description: "자신의 방어를 다음 턴까지 2 높인다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "self",
      rangeMin: 0,
      rangeMax: 0,
      effect: {
        kind: "buff",
        buff: {
          id: "shield_formation_buff",
          name: "방진",
          defenseBonus: 2,
          remainingOwnPhases: 1
        }
      }
    }
  ];

  const SPECIAL_SKILLS = {
    warlord_presence: {
      id: "warlord_presence",
      name: "전장의 위압",
      description: "선공 시 피해 +2, 명중 +8",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.isInitiator ? { attackPowerBonus: 2, hitBonus: 8 } : null;
      }
    },
    fortress_heart: {
      id: "fortress_heart",
      name: "성채의 심장",
      description: "체력이 절반 이하일 때 방어 +3",
      unlockLevel: 1,
      defenderEffect(context) {
        return context.defender.hp <= Math.ceil(context.defender.maxHp / 2) ? { defenseBonus: 3 } : null;
      }
    },
    eagle_commander: {
      id: "eagle_commander",
      name: "매사냥 지휘",
      description: "원거리 공격 시 명중 +10, 피해 +2",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.distance >= 2 ? { hitBonus: 10, attackPowerBonus: 2 } : null;
      }
    }
  };

  const SPECIAL_ACTIVE_SKILLS = {
    boss_cleave: {
      id: "boss_cleave",
      name: "분쇄 베기",
      description: "인접 적 1명에게 명중 +10, 피해 +4의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: {
        kind: "attack",
        hitBonus: 10,
        damageBonus: 4
      }
    },
    guard_roar: {
      id: "guard_roar",
      name: "수비 포효",
      description: "자신의 방어를 다음 턴까지 4 높인다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "self",
      rangeMin: 0,
      rangeMax: 0,
      effect: {
        kind: "buff",
        buff: {
          id: "guard_roar_buff",
          name: "수비 포효",
          defenseBonus: 4,
          remainingOwnPhases: 1
        }
      }
    },
    rain_of_arrows: {
      id: "rain_of_arrows",
      name: "폭우 사격",
      description: "사거리 내 적 1명에게 명중 +14, 피해 +4의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: {
        kind: "attack",
        hitBonus: 14,
        damageBonus: 4
      }
    },
    frenzy_assault: {
      id: "frenzy_assault",
      name: "광란 돌격",
      description: "인접 적 1명에게 명중 +8, 피해 +5의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: {
        kind: "attack",
        hitBonus: 8,
        damageBonus: 5
      }
    },
    adamant_guard: {
      id: "adamant_guard",
      name: "철갑 수호",
      description: "자신의 방어를 다음 턴까지 5 높인다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "self",
      rangeMin: 0,
      rangeMax: 0,
      effect: {
        kind: "buff",
        buff: {
          id: "adamant_guard_buff",
          name: "철갑 수호",
          defenseBonus: 5,
          remainingOwnPhases: 1
        }
      }
    },
    marked_shot: {
      id: "marked_shot",
      name: "표식 사격",
      description: "사거리 내 적 1명에게 명중 +20, 피해 +3의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: {
        kind: "attack",
        hitBonus: 20,
        damageBonus: 3
      }
    }
  };

  const GROWTH_RATES = {
    로드: { maxHp: 0.65, str: 0.55, skl: 0.6, spd: 0.55, def: 0.4, mov: 0.05 },
    랜서: { maxHp: 0.7, str: 0.55, skl: 0.45, spd: 0.45, def: 0.55, mov: 0.04 },
    아처: { maxHp: 0.5, str: 0.45, skl: 0.7, spd: 0.6, def: 0.3, mov: 0.04 },
    하이로드: { maxHp: 0.72, str: 0.6, skl: 0.64, spd: 0.58, def: 0.48, mov: 0.08 },
    팔라딘: { maxHp: 0.74, str: 0.6, skl: 0.5, spd: 0.48, def: 0.6, mov: 0.08 },
    스나이퍼: { maxHp: 0.58, str: 0.52, skl: 0.75, spd: 0.62, def: 0.34, mov: 0.06 },
    검사: { maxHp: 0.55, str: 0.5, skl: 0.58, spd: 0.55, def: 0.32, mov: 0.03 },
    브리건드: { maxHp: 0.68, str: 0.62, skl: 0.35, spd: 0.32, def: 0.4, mov: 0.03 },
    헌터: { maxHp: 0.52, str: 0.46, skl: 0.65, spd: 0.52, def: 0.28, mov: 0.03 },
    솔저: { maxHp: 0.6, str: 0.48, skl: 0.42, spd: 0.4, def: 0.48, mov: 0.03 }
  };

  const PROMOTION_TREE = {
    로드: [
      {
        className: "하이로드",
        unlockLevel: 5,
        description: "지휘형 상급 검사. 이동과 전반 능력치가 오른다.",
        statBonuses: { maxHp: 2, str: 2, skl: 1, spd: 1, def: 1, mov: 1 }
      }
    ],
    랜서: [
      {
        className: "팔라딘",
        unlockLevel: 5,
        description: "방어 중심 상급 기마 창병. 생존력과 이동이 오른다.",
        statBonuses: { maxHp: 2, str: 1, skl: 1, spd: 1, def: 2, mov: 1 }
      }
    ],
    아처: [
      {
        className: "스나이퍼",
        unlockLevel: 5,
        description: "원거리 특화 상급 궁수. 기술과 화력이 오른다.",
        statBonuses: { maxHp: 1, str: 2, skl: 2, spd: 1, def: 1, mov: 1 }
      }
    ]
  };

  function mergeModifier(target, modifier, skillName) {
    if (!modifier) {
      return;
    }

    target.attackPowerBonus += modifier.attackPowerBonus || 0;
    target.defenseBonus += modifier.defenseBonus || 0;
    target.hitBonus += modifier.hitBonus || 0;
    target.avoidBonus += modifier.avoidBonus || 0;
    target.triggeredSkills.push(skillName);
  }

  function mergeStatusModifiers(target, unit) {
    (unit.statusEffects || []).forEach((effect) => {
      target.attackPowerBonus += effect.attackPowerBonus || 0;
      target.defenseBonus += effect.defenseBonus || 0;
      target.hitBonus += effect.hitBonus || 0;
      target.avoidBonus += effect.avoidBonus || 0;

      if (effect.name) {
        target.triggeredSkills.push(effect.name);
      }
    });
  }

  function getSpecialSkills(unit) {
    return (unit.specialSkillIds || [])
      .map((skillId) => SPECIAL_SKILLS[skillId])
      .filter(Boolean);
  }

  function getSpecialActiveSkills(unit) {
    return (unit.specialActiveSkillIds || [])
      .map((skillId) => SPECIAL_ACTIVE_SKILLS[skillId])
      .filter(Boolean);
  }

  function getSkillsForUnit(unit) {
    return (CLASS_SKILLS[unit.className] || [])
      .concat(getSpecialSkills(unit))
      .filter((skill) => (unit.level || 1) >= skill.unlockLevel);
  }

  function getActiveSkillsForUnit(unit) {
    return (CLASS_ACTIVE_SKILLS[unit.className] || [])
      .concat(getSpecialActiveSkills(unit))
      .filter((skill) => (unit.level || 1) >= skill.unlockLevel);
  }

  function getNewlyUnlockedActiveSkills(className, previousLevel, newLevel) {
    return (CLASS_ACTIVE_SKILLS[className] || []).filter(
      (skill) => skill.unlockLevel > previousLevel && skill.unlockLevel <= newLevel
    );
  }

  function getCombatModifiers(context) {
    const result = {
      attackPowerBonus: 0,
      defenseBonus: 0,
      hitBonus: 0,
      avoidBonus: 0,
      triggeredSkills: []
    };

    getSkillsForUnit(context.attacker).forEach((skill) => {
      mergeModifier(result, skill.attackerEffect ? skill.attackerEffect(context) : null, skill.name);
    });

    getSkillsForUnit(context.defender).forEach((skill) => {
      mergeModifier(result, skill.defenderEffect ? skill.defenderEffect(context) : null, skill.name);
    });

    mergeStatusModifiers(result, context.attacker);
    mergeStatusModifiers(result, context.defender);

    result.triggeredSkills = Array.from(new Set(result.triggeredSkills));
    return result;
  }

  function rollLevelGains(unit) {
    const rates = GROWTH_RATES[unit.className] || GROWTH_RATES.로드;
    const gains = {
      maxHp: 0,
      str: 0,
      skl: 0,
      spd: 0,
      def: 0,
      mov: 0
    };
    const keys = Object.keys(gains);
    let gainCount = 0;

    keys.forEach((statName) => {
      if (Math.random() < rates[statName]) {
        gains[statName] += 1;
        gainCount += 1;
      }
    });

    if (gainCount === 0) {
      const fallbackStat = keys
        .slice()
        .sort((left, right) => rates[right] - rates[left])[0];
      gains[fallbackStat] = 1;
    }

    return gains;
  }

  function applyLevelGains(unit, gains) {
    Object.keys(gains).forEach((statName) => {
      if (!gains[statName]) {
        return;
      }

      unit[statName] += gains[statName];

      if (statName === "maxHp") {
        unit.hp += gains[statName];
      }
    });

    return unit;
  }

  function getNewlyUnlockedSkills(className, previousLevel, newLevel) {
    return (CLASS_SKILLS[className] || []).filter(
      (skill) => skill.unlockLevel > previousLevel && skill.unlockLevel <= newLevel
    );
  }

  function getPromotionOptions(unit) {
    return ((PROMOTION_TREE[unit.className] || []).filter(
      (promotion) => (unit.level || 1) >= promotion.unlockLevel
    ));
  }

  function canPromote(unit) {
    return getPromotionOptions(unit).length > 0;
  }

  function promoteUnit(unit, nextClassName) {
    const promotion = (PROMOTION_TREE[unit.className] || []).find((entry) => entry.className === nextClassName);

    if (!promotion) {
      throw new Error("이 유닛은 해당 클래스로 전직할 수 없습니다.");
    }

    if ((unit.level || 1) < promotion.unlockLevel) {
      throw new Error(`전직하려면 Lv.${promotion.unlockLevel} 이상이 필요합니다.`);
    }

    const previousClassName = unit.className;
    unit.className = promotion.className;
    unit.promotionHistory = unit.promotionHistory || [];
    unit.promotionHistory.push({
      from: previousClassName,
      to: promotion.className,
      promotedAtLevel: unit.level || 1
    });

    Object.keys(promotion.statBonuses || {}).forEach((statName) => {
      const bonus = promotion.statBonuses[statName] || 0;
      unit[statName] += bonus;

      if (statName === "maxHp") {
        unit.hp += bonus;
      }
    });

    return {
      promotion,
      previousClassName,
      unit
    };
  }

  function describeSkills(unit) {
    const skills = getSkillsForUnit(unit);

    if (!skills.length) {
      return "없음";
    }

    return skills.map((skill) => `${skill.name}: ${skill.description}`).join(" / ");
  }

  function describeActiveSkills(unit) {
    const skills = getActiveSkillsForUnit(unit);

    if (!skills.length) {
      return "없음";
    }

    return skills.map((skill) => `${skill.name}: ${skill.description}`).join(" / ");
  }

  global.SkillsService = {
    CLASS_SKILLS,
    CLASS_ACTIVE_SKILLS,
    SPECIAL_SKILLS,
    SPECIAL_ACTIVE_SKILLS,
    GROWTH_RATES,
    PROMOTION_TREE,
    getSkillsForUnit,
    getActiveSkillsForUnit,
    getCombatModifiers,
    rollLevelGains,
    applyLevelGains,
    getNewlyUnlockedSkills,
    getNewlyUnlockedActiveSkills,
    getPromotionOptions,
    canPromote,
    promoteUnit,
    describeSkills,
    describeActiveSkills
  };
})(window);
