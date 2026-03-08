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
      },
      {
        id: "highland_command",
        name: "고지 지휘",
        description: "고지에서 공격 시 명중 +8",
        unlockLevel: 4,
        attackerEffect(context) {
          return context.attackerTileType === "hill" ? { hitBonus: 8 } : null;
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
      },
      {
        id: "crown_highground",
        name: "왕가의 제고지",
        description: "고지에서 공격 시 명중 +10, 피해 +1",
        unlockLevel: 3,
        attackerEffect(context) {
          return context.attackerTileType === "hill" ? { hitBonus: 10, attackPowerBonus: 1 } : null;
        }
      }
    ],
    클레릭: [
      {
        id: "sacred_bulwark",
        name: "성역 수호",
        description: "방어 시 방어 +1, 회피 +6",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 1, avoidBonus: 6 };
        }
      },
      {
        id: "blessed_guidance",
        name: "축복의 인도",
        description: "공격 시 명중 +6",
        unlockLevel: 4,
        attackerEffect() {
          return { hitBonus: 6 };
        }
      }
    ],
    비숍: [
      {
        id: "sanctuary_aura",
        name: "성소의 기운",
        description: "방어 시 방어 +2, 회피 +8",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 2, avoidBonus: 8 };
        }
      },
      {
        id: "judgment_light",
        name: "심판의 빛",
        description: "공격 시 명중 +8, 피해 +1",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 8, attackPowerBonus: 1 };
        }
      },
      {
        id: "divine_focus",
        name: "신성 집중",
        description: "체력이 절반 이상일 때 명중 +6",
        unlockLevel: 3,
        attackerEffect(context) {
          return context.attacker.hp >= Math.ceil(context.attacker.maxHp / 2) ? { hitBonus: 6 } : null;
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
      },
      {
        id: "ridge_guard",
        name: "능선 수비",
        description: "고지에서 방어 +2",
        unlockLevel: 5,
        defenderEffect(context) {
          return context.defenderTileType === "hill" ? { defenseBonus: 2 } : null;
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
      },
      {
        id: "plateau_lancer",
        name: "고원 돌격",
        description: "고지에서 선공 시 피해 +2",
        unlockLevel: 3,
        attackerEffect(context) {
          return context.attackerTileType === "hill" && context.isInitiator ? { attackPowerBonus: 2 } : null;
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
      },
      {
        id: "ridge_archery",
        name: "능선 사수",
        description: "고지에서 원거리 공격 시 명중 +8",
        unlockLevel: 4,
        attackerEffect(context) {
          return context.attackerTileType === "hill" && context.distance >= 2 ? { hitBonus: 8 } : null;
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
      },
      {
        id: "elevated_scope",
        name: "고지 조준",
        description: "고지에서 원거리 공격 시 명중 +10, 피해 +1",
        unlockLevel: 3,
        attackerEffect(context) {
          return context.attackerTileType === "hill" && context.distance >= 2 ? { hitBonus: 10, attackPowerBonus: 1 } : null;
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
      },
      {
        id: "woodland_step",
        name: "수림 보법",
        description: "숲에서 회피 +10",
        unlockLevel: 4,
        defenderEffect(context) {
          return context.defenderTileType === "forest" ? { avoidBonus: 10 } : null;
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
      },
      {
        id: "cliff_raider",
        name: "절벽 약탈",
        description: "고지에서 공격 시 피해 +2",
        unlockLevel: 4,
        attackerEffect(context) {
          return context.attackerTileType === "hill" ? { attackPowerBonus: 2 } : null;
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
      },
      {
        id: "canopy_veil",
        name: "수관 은폐",
        description: "숲에서 방어 시 회피 +8",
        unlockLevel: 4,
        defenderEffect(context) {
          return context.defenderTileType === "forest" ? { avoidBonus: 8 } : null;
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
      },
      {
        id: "stonefoot",
        name: "석각 보루",
        description: "고지나 숲에서 방어 +1",
        unlockLevel: 4,
        defenderEffect(context) {
          return context.defenderTileType === "hill" || context.defenderTileType === "forest" ? { defenseBonus: 1 } : null;
        }
      }
    ]
  };

  const CLASS_ACTIVE_SKILLS = {
    로드: [
      {
        id: "rally_heal",
        name: "전장의 기원",
        description: "사거리 0-2의 자신 또는 아군 1명을 8 회복한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "ally",
        rangeMin: 0,
        rangeMax: 2,
        effect: {
          kind: "heal",
          amount: 8
        }
      },
      {
        id: "hill_command",
        name: "고지 돌파",
        description: "고지에서만 사용 가능. 사거리 내 적 1명에게 명중 +18, 피해 +3의 공격을 가한다.",
        unlockLevel: 5,
        cooldown: 3,
        targetType: "enemy",
        useWeaponRange: true,
        requiredTileTypes: ["hill"],
        effect: {
          kind: "attack",
          hitBonus: 18,
          damageBonus: 3
        }
      }
    ],
    하이로드: [
      {
        id: "royal_recovery",
        name: "왕가의 회복",
        description: "사거리 0-3의 자신 또는 아군 1명을 12 회복한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "ally",
        rangeMin: 0,
        rangeMax: 3,
        effect: {
          kind: "heal",
          amount: 12
        }
      }
    ],
    클레릭: [
      {
        id: "healing_prayer",
        name: "치유의 기도",
        description: "사거리 0-3의 자신 또는 아군 1명을 10 회복한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "ally",
        rangeMin: 0,
        rangeMax: 3,
        effect: {
          kind: "heal",
          amount: 10
        }
      },
      {
        id: "holy_missile",
        name: "홀리 미사일",
        description: "사거리 1-3의 적 1명에게 명중 +14, 피해 +4의 성광탄을 날린다.",
        unlockLevel: 3,
        cooldown: 3,
        targetType: "enemy",
        rangeMin: 1,
        rangeMax: 3,
        effect: {
          kind: "attack",
          hitBonus: 14,
          damageBonus: 4
        }
      }
    ],
    비숍: [
      {
        id: "radiant_blessing",
        name: "광휘의 축복",
        description: "사거리 0-4의 자신 또는 아군 1명을 14 회복한다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "ally",
        rangeMin: 0,
        rangeMax: 4,
        effect: {
          kind: "heal",
          amount: 14
        }
      },
      {
        id: "holy_lance",
        name: "홀리 랜스",
        description: "사거리 1-4의 적 1명에게 명중 +18, 피해 +6의 성창을 내리꽂는다.",
        unlockLevel: 1,
        cooldown: 3,
        targetType: "enemy",
        rangeMin: 1,
        rangeMax: 4,
        effect: {
          kind: "attack",
          hitBonus: 18,
          damageBonus: 6
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
      },
      {
        id: "forest_guard",
        name: "수림 수비",
        description: "숲에서만 사용 가능. 자신에게 방어 +3, 회피 +10을 부여한다.",
        unlockLevel: 5,
        cooldown: 3,
        targetType: "self",
        rangeMin: 0,
        rangeMax: 0,
        requiredTileTypes: ["forest"],
        effect: {
          kind: "buff",
          buff: {
            id: "forest_guard_buff",
            name: "수림 수비",
            defenseBonus: 3,
            avoidBonus: 10,
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
      },
      {
        id: "ridge_volley",
        name: "능선 일제사격",
        description: "고지에서만 사용 가능. 사거리 내 적 1명에게 명중 +24, 피해 +4의 공격을 가한다.",
        unlockLevel: 5,
        cooldown: 3,
        targetType: "enemy",
        useWeaponRange: true,
        requiredTileTypes: ["hill"],
        effect: {
          kind: "attack",
          hitBonus: 24,
          damageBonus: 4
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
    클레릭: { maxHp: 0.52, str: 0.28, skl: 0.52, spd: 0.46, def: 0.3, mov: 0.03 },
    랜서: { maxHp: 0.7, str: 0.55, skl: 0.45, spd: 0.45, def: 0.55, mov: 0.04 },
    아처: { maxHp: 0.5, str: 0.45, skl: 0.7, spd: 0.6, def: 0.3, mov: 0.04 },
    하이로드: { maxHp: 0.72, str: 0.6, skl: 0.64, spd: 0.58, def: 0.48, mov: 0.08 },
    비숍: { maxHp: 0.6, str: 0.36, skl: 0.62, spd: 0.5, def: 0.36, mov: 0.04 },
    팔라딘: { maxHp: 0.74, str: 0.6, skl: 0.5, spd: 0.48, def: 0.6, mov: 0.08 },
    스나이퍼: { maxHp: 0.58, str: 0.52, skl: 0.75, spd: 0.62, def: 0.34, mov: 0.06 },
    검사: { maxHp: 0.55, str: 0.5, skl: 0.58, spd: 0.55, def: 0.32, mov: 0.03 },
    브리건드: { maxHp: 0.68, str: 0.62, skl: 0.35, spd: 0.32, def: 0.4, mov: 0.03 },
    헌터: { maxHp: 0.52, str: 0.46, skl: 0.65, spd: 0.52, def: 0.28, mov: 0.03 },
    솔저: { maxHp: 0.6, str: 0.48, skl: 0.42, spd: 0.4, def: 0.48, mov: 0.03 }
  };

  const CLASS_WEAPON_TYPES = {
    로드: ["sword"],
    하이로드: ["sword"],
    클레릭: ["focus"],
    비숍: ["focus"],
    랜서: ["lance"],
    팔라딘: ["lance"],
    아처: ["bow"],
    스나이퍼: ["bow"],
    검사: ["sword"],
    브리건드: ["axe"],
    헌터: ["bow"],
    솔저: ["lance"],
    "고블린 척후병": ["sword"],
    점액괴물: ["sword"],
    "흉포 늑대": ["sword"],
    구울: ["axe"],
    하피: ["bow"],
    "오크 파쇄병": ["axe"],
    "스켈레톤 창병": ["lance"],
    가고일: ["lance"],
    바실리스크: ["bow"]
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
    클레릭: [
      {
        className: "비숍",
        unlockLevel: 5,
        description: "회복과 성속성 공격을 함께 다루는 상급 성직자입니다.",
        statBonuses: { maxHp: 2, str: 1, skl: 2, spd: 1, def: 1, mov: 1 }
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

  const WEAPON_MATCHUP_META = {
    sword: {
      role: "정확한 근접 기본형",
      matchup: "도끼보다 안정적으로 맞히기 쉽고, 고정 무기 삼각 보정은 없습니다.",
      caution: "창처럼 단단한 전열이나 활의 선사거리 견제에는 거리를 좁혀야 합니다."
    },
    lance: {
      role: "전열 유지형 근접",
      matchup: "좁은 길목과 받아치기에 강하고, 방어형 병종과 궁합이 좋습니다.",
      caution: "순간 화력은 도끼보다 낮아 고회피 적을 오래 붙잡을 수 있습니다."
    },
    bow: {
      role: "원거리 견제형",
      matchup: "2칸 이상에서 안전하게 압박하고 고지에서 사거리가 늘어납니다.",
      caution: "근접 인접전에는 취약하니 전열 보호가 필요합니다."
    },
    focus: {
      role: "회복/성광 보조형",
      matchup: "아군 유지력과 안전한 견제에 강하고, INT 기반 스킬 보정 효율이 높습니다.",
      caution: "기본 평타 화력은 낮아 전열 보호와 스킬 운용이 중요합니다."
    },
    axe: {
      role: "고화력 근접 파쇄형",
      matchup: "한 방 화력이 높아 방어가 높은 적이나 체력이 많은 적을 밀기 좋습니다.",
      caution: "명중이 낮은 편이라 빠르고 회피가 높은 적에게 불안정합니다."
    }
  };

  const CLASS_ROLE_META = {
    로드: {
      role: "균형형 전열 지휘관",
      summary: "검을 쓰며 전선을 이끄는 지휘형 병종입니다. 힐러가 아니라 근접 선봉에 가깝고 응급 회복만 보조적으로 다룹니다.",
      strengths: "안정적인 근접전, 선공 시 이득, 응급 지원, 고지 운용",
      caution: "전담 힐러처럼 지속 회복에 특화된 병종은 아니며, 후열 유지력은 클레릭 계열이 더 좋습니다."
    },
    하이로드: {
      role: "상급 지휘형 선봉",
      summary: "이동력과 전반 능력치가 오른 상급 지휘 전열입니다. 회복은 가능하지만 본질은 선봉 지휘관입니다.",
      strengths: "전선 유지, 선공 압박, 응급 회복, 고지 활용",
      caution: "전담 힐러만큼 광범위한 아군 유지력을 제공하지는 않습니다."
    },
    클레릭: {
      role: "후열 힐러",
      summary: "아군 회복과 안정적인 지원에 특화된 성직자 병종입니다.",
      strengths: "중거리 회복, 후열 유지, 성광 공격 스킬",
      caution: "기본 교전 화력과 탱킹은 전열 병종보다 낮습니다."
    },
    비숍: {
      role: "상급 성광 힐러",
      summary: "회복과 성속성 공격을 모두 운용하는 상급 성직자 병종입니다.",
      strengths: "광범위 회복, 홀리 계열 공격, 후열 안전 운영",
      caution: "근접 난전에 오래 노출되면 쉽게 무너질 수 있습니다."
    },
    랜서: {
      role: "수비형 전열",
      summary: "방어와 체력이 좋아 좁은 길목을 버티는 병종입니다.",
      strengths: "근접 받아치기, 길목 봉쇄, 안정적인 생존",
      caution: "기동전과 추격 능력은 빠른 병종보다 둔합니다."
    },
    팔라딘: {
      role: "상급 기동 전열",
      summary: "이동과 생존을 모두 챙긴 상급 창 전열 병종입니다.",
      strengths: "전선 전환, 버티기, 선봉 유지",
      caution: "극딜 역할은 화력 특화 병종보다 낮습니다."
    },
    아처: {
      role: "후열 사격",
      summary: "안전한 거리에서 마무리 화력을 넣는 원거리 병종입니다.",
      strengths: "원거리 마무리, 고지 사격, 반격 회피",
      caution: "전열이 무너지면 근접 압박에 취약합니다."
    },
    스나이퍼: {
      role: "상급 정밀 사수",
      summary: "명중과 화력을 극대화한 상급 원거리 병종입니다.",
      strengths: "원거리 확정 압박, 저체력 적 마무리, 고지 사격",
      caution: "직접 맞기 시작하면 유지력이 낮습니다."
    },
    검사: {
      role: "기동형 결투사",
      summary: "명중과 속도가 좋아 1대1 교전에 강한 병종입니다.",
      strengths: "고회피 적 상대, 숲 지형 활용, 안정적인 명중",
      caution: "방어와 체력이 낮아 오래 버티는 전열에는 불리합니다."
    },
    브리건드: {
      role: "파쇄형 돌격수",
      summary: "높은 힘으로 한 방을 노리는 도끼 병종입니다.",
      strengths: "고체력 적 압박, 선공 폭딜, 고지 화력",
      caution: "명중이 낮아 회피형 적에게 손해 보기 쉽습니다."
    },
    헌터: {
      role: "기동형 사격수",
      summary: "원거리 견제와 정확도를 동시에 챙긴 병종입니다.",
      strengths: "선제 견제, 원거리 안전딜, 표적 마킹",
      caution: "붙잡히면 생존력이 낮습니다."
    },
    솔저: {
      role: "균형형 수비 전열",
      summary: "방어와 명중이 무난한 창 기반 전열 병종입니다.",
      strengths: "라인 유지, 안정적인 대응, 방어전",
      caution: "속도와 폭딜은 특화 병종보다 떨어집니다."
    },
    "고블린 척후병": {
      role: "적 기동 척후",
      summary: "빠르게 달라붙어 빈틈을 파고드는 경량 적입니다.",
      strengths: "속도, 측면 침투",
      caution: "방어와 체력이 낮습니다."
    },
    점액괴물: {
      role: "둔중한 버티기형",
      summary: "느리지만 체력과 방어가 높은 적입니다.",
      strengths: "버티기, 전선 지연",
      caution: "속도가 느려 포위와 원거리 견제에 약합니다."
    },
    "흉포 늑대": {
      role: "돌파형 추격수",
      summary: "기동력이 높아 후열을 물기 좋은 적입니다.",
      strengths: "기동, 추격, 빈칸 침투",
      caution: "정면 교전 유지력은 높지 않습니다."
    },
    구울: {
      role: "근접 압박형",
      summary: "명중은 불안하지만 맞으면 아픈 도끼 적입니다.",
      strengths: "근접 화력, 압박",
      caution: "회피형이나 거리 조절에 약합니다."
    },
    하피: {
      role: "기동 사격형",
      summary: "빠르게 각을 잡아 원거리 견제를 넣는 적입니다.",
      strengths: "기동, 사격, 위치 선점",
      caution: "붙잡히면 쉽게 무너집니다."
    },
    "오크 파쇄병": {
      role: "중장 파괴자",
      summary: "체력과 힘으로 밀어붙이는 중장 적입니다.",
      strengths: "고화력, 높은 체력",
      caution: "속도와 명중이 낮은 편입니다."
    },
    "스켈레톤 창병": {
      role: "수비 창병",
      summary: "무난한 방어를 갖춘 창 전열 적입니다.",
      strengths: "라인 유지, 대응력",
      caution: "특별한 화력이나 기동은 낮습니다."
    },
    가고일: {
      role: "단단한 전진형",
      summary: "방어가 높아 전선에서 버티기 좋은 적입니다.",
      strengths: "방어, 안정적인 접근",
      caution: "장기전 원거리 압박에 약합니다."
    },
    바실리스크: {
      role: "원거리 제압형",
      summary: "정확도가 높아 후열에 위협적인 사격 적입니다.",
      strengths: "명중, 원거리 압박",
      caution: "근접에 붙으면 위험해집니다."
    }
  };

  function copyEntries(entries) {
    return (entries || []).map((entry) => Object.assign({}, entry));
  }

  Object.assign(SPECIAL_SKILLS, {
    blade_discipline: {
      id: "blade_discipline",
      name: "검무 수련",
      description: "공격 시 명중 +6",
      unlockLevel: 1,
      attackerEffect() {
        return { hitBonus: 6 };
      }
    },
    sovereign_drive: {
      id: "sovereign_drive",
      name: "제왕의 진격",
      description: "선공 시 명중 +6, 피해 +2",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.isInitiator ? { hitBonus: 6, attackPowerBonus: 2 } : null;
      }
    },
    guardian_oath: {
      id: "guardian_oath",
      name: "수호의 맹세",
      description: "방어 시 방어 +2",
      unlockLevel: 1,
      defenderEffect() {
        return { defenseBonus: 2 };
      }
    },
    ranger_instinct: {
      id: "ranger_instinct",
      name: "추적 본능",
      description: "원거리 공격 시 명중 +8",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.distance >= 2 ? { hitBonus: 8 } : null;
      }
    },
    trap_sense: {
      id: "trap_sense",
      name: "덫 감각",
      description: "숲에서 회피 +10",
      unlockLevel: 1,
      defenderEffect(context) {
        return context.defenderTileType === "forest" ? { avoidBonus: 10 } : null;
      }
    },
    berserk_blood: {
      id: "berserk_blood",
      name: "광전의 피",
      description: "체력이 절반 이하일 때 피해 +3",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.attacker.hp <= Math.ceil(context.attacker.maxHp / 2) ? { attackPowerBonus: 3 } : null;
      }
    },
    saint_guard: {
      id: "saint_guard",
      name: "성자의 가호",
      description: "체력이 절반 이상일 때 방어 +2",
      unlockLevel: 1,
      defenderEffect(context) {
        return context.defender.hp >= Math.ceil(context.defender.maxHp / 2) ? { defenseBonus: 2 } : null;
      }
    },
    oracle_insight: {
      id: "oracle_insight",
      name: "예지의 눈",
      description: "공격 시 명중 +8",
      unlockLevel: 1,
      attackerEffect() {
        return { hitBonus: 8 };
      }
    },
    imperial_banner: {
      id: "imperial_banner",
      name: "황제의 군기",
      description: "선공 시 피해 +3",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.isInitiator ? { attackPowerBonus: 3 } : null;
      }
    },
    aegis_core: {
      id: "aegis_core",
      name: "이지스 핵",
      description: "방어 시 방어 +3, 회피 +4",
      unlockLevel: 1,
      defenderEffect() {
        return { defenseBonus: 3, avoidBonus: 4 };
      }
    },
    celestial_scope: {
      id: "celestial_scope",
      name: "천궁 조준",
      description: "원거리 공격 시 명중 +10, 피해 +1",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.distance >= 2 ? { hitBonus: 10, attackPowerBonus: 1 } : null;
      }
    },
    doom_mark: {
      id: "doom_mark",
      name: "파멸의 낙인",
      description: "선공 시 피해 +4",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.isInitiator ? { attackPowerBonus: 4 } : null;
      }
    },
    nightmare_trail: {
      id: "nightmare_trail",
      name: "악몽의 궤적",
      description: "숲이나 고지에서 공격 시 피해 +2, 회피 +6",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.attackerTileType === "forest" || context.attackerTileType === "hill"
          ? { attackPowerBonus: 2, avoidBonus: 6 }
          : null;
      }
    },
    holy_charge: {
      id: "holy_charge",
      name: "성창 기세",
      description: "선공 시 명중 +8, 피해 +2",
      unlockLevel: 1,
      attackerEffect(context) {
        return context.isInitiator ? { hitBonus: 8, attackPowerBonus: 2 } : null;
      }
    }
  });

  Object.assign(SPECIAL_ACTIVE_SKILLS, {
    moon_slash: {
      id: "moon_slash",
      name: "월광참",
      description: "적 1명에게 명중 +16, 피해 +4의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 16, damageBonus: 4 }
    },
    royal_burst: {
      id: "royal_burst",
      name: "로열 버스트",
      description: "적 1명에게 명중 +18, 피해 +6의 강공을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 18, damageBonus: 6 }
    },
    wall_stance: {
      id: "wall_stance",
      name: "철성 자세",
      description: "자신에게 방어 +4, 회피 +8을 부여한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "self",
      rangeMin: 0,
      rangeMax: 0,
      effect: {
        kind: "buff",
        buff: { id: "wall_stance_buff", name: "철성 자세", defenseBonus: 4, avoidBonus: 8, remainingOwnPhases: 1 }
      }
    },
    gale_arrow: {
      id: "gale_arrow",
      name: "질풍화살",
      description: "적 1명에게 명중 +18, 피해 +4의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 18, damageBonus: 4 }
    },
    snare_bolt: {
      id: "snare_bolt",
      name: "속박 사격",
      description: "적 1명에게 명중 +15, 피해 +4의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 15, damageBonus: 4 }
    },
    reaper_swing: {
      id: "reaper_swing",
      name: "사신 도륙",
      description: "적 1명에게 명중 +10, 피해 +8의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 10, damageBonus: 8 }
    },
    sanctuary_wave: {
      id: "sanctuary_wave",
      name: "생츄어리 웨이브",
      description: "사거리 0-3의 자신 또는 아군 1명을 16 회복한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "ally",
      rangeMin: 0,
      rangeMax: 3,
      effect: { kind: "heal", amount: 16 }
    },
    oracle_ray: {
      id: "oracle_ray",
      name: "오라클 레이",
      description: "사거리 1-3의 적 1명에게 명중 +18, 피해 +5의 성광선을 쏜다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      rangeMin: 1,
      rangeMax: 3,
      effect: { kind: "attack", hitBonus: 18, damageBonus: 5 }
    },
    holy_lance: {
      id: "holy_lance",
      name: "홀리 랜스",
      description: "적 1명에게 명중 +18, 피해 +6의 신성 돌격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 18, damageBonus: 6 }
    },
    meteor_strike: {
      id: "meteor_strike",
      name: "메테오 스트라이크",
      description: "적 1명에게 명중 +20, 피해 +8의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 20, damageBonus: 8 }
    },
    aegis_field: {
      id: "aegis_field",
      name: "이지스 필드",
      description: "자신에게 방어 +5, 회피 +10을 부여한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "self",
      rangeMin: 0,
      rangeMax: 0,
      effect: {
        kind: "buff",
        buff: { id: "aegis_field_buff", name: "이지스 필드", defenseBonus: 5, avoidBonus: 10, remainingOwnPhases: 1 }
      }
    },
    comet_rain: {
      id: "comet_rain",
      name: "혜성우",
      description: "적 1명에게 명중 +22, 피해 +7의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 22, damageBonus: 7 }
    },
    apocalypse_judgment: {
      id: "apocalypse_judgment",
      name: "종말 심판",
      description: "사거리 1-4의 적 1명에게 명중 +20, 피해 +8의 심판광을 내린다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      rangeMin: 1,
      rangeMax: 4,
      effect: { kind: "attack", hitBonus: 20, damageBonus: 8 }
    },
    nightmare_hunt: {
      id: "nightmare_hunt",
      name: "악몽 사냥",
      description: "적 1명에게 명중 +18, 피해 +7의 공격을 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 18, damageBonus: 7 }
    },
    world_breaker: {
      id: "world_breaker",
      name: "월드 브레이커",
      description: "적 1명에게 명중 +14, 피해 +10의 강타를 가한다.",
      unlockLevel: 1,
      cooldown: 3,
      targetType: "enemy",
      useWeaponRange: true,
      effect: { kind: "attack", hitBonus: 14, damageBonus: 10 }
    }
  });

  const RANDOM_MILESTONE_SKILL_POOLS = {
    sword: ["blade_discipline", "moon_slash", "sovereign_drive", "royal_burst"],
    lance: ["guardian_oath", "wall_stance", "holy_charge", "holy_lance"],
    bow: ["ranger_instinct", "gale_arrow", "trap_sense", "snare_bolt"],
    axe: ["berserk_blood", "reaper_swing", "doom_mark", "world_breaker"],
    focus: ["saint_guard", "sanctuary_wave", "oracle_insight", "oracle_ray"]
  };

  const PROMOTION_SKILL_REWARDS = {
    하이로드: ["sovereign_drive", "royal_burst"],
    블레이드로드: ["blade_discipline", "moon_slash"],
    소드마스터: ["blade_discipline", "moon_slash"],
    팔라딘: ["holy_charge", "holy_lance"],
    가디언: ["guardian_oath", "wall_stance"],
    센티넬: ["guardian_oath", "aegis_field"],
    스나이퍼: ["celestial_scope", "comet_rain"],
    레인저: ["ranger_instinct", "gale_arrow"],
    트래퍼: ["trap_sense", "snare_bolt"],
    버서커: ["berserk_blood", "reaper_swing"],
    워브레이커: ["doom_mark", "world_breaker"],
    비숍: ["saint_guard", "sanctuary_wave"],
    오라클: ["oracle_insight", "oracle_ray"],
    엠퍼러: ["imperial_banner", "royal_burst"],
    검성: ["blade_discipline", "meteor_strike"],
    홀리랜서: ["holy_charge", "holy_lance"],
    포트리스: ["aegis_core", "aegis_field"],
    호크아이: ["celestial_scope", "comet_rain"],
    그림트래퍼: ["nightmare_trail", "nightmare_hunt"],
    데스브링어: ["doom_mark", "world_breaker"],
    세라핌: ["saint_guard", "sanctuary_wave"],
    인퀴지터: ["oracle_insight", "apocalypse_judgment"],
    오버로드: ["imperial_banner", "meteor_strike"],
    스타블레이드: ["blade_discipline", "meteor_strike"],
    아크랜서: ["holy_charge", "holy_lance"],
    이지스로드: ["aegis_core", "aegis_field"],
    천궁성: ["celestial_scope", "comet_rain"],
    나이트메어헌트: ["nightmare_trail", "nightmare_hunt"],
    월드이터: ["doom_mark", "world_breaker"],
    성녀: ["saint_guard", "sanctuary_wave"],
    아크저지: ["oracle_insight", "apocalypse_judgment"]
  };

  Object.assign(CLASS_WEAPON_TYPES, {
    블레이드로드: ["sword"],
    소드마스터: ["sword"],
    엠퍼러: ["sword"],
    검성: ["sword"],
    오버로드: ["sword"],
    스타블레이드: ["sword"],
    가디언: ["lance"],
    센티넬: ["lance"],
    홀리랜서: ["lance"],
    포트리스: ["lance"],
    아크랜서: ["lance"],
    이지스로드: ["lance"],
    레인저: ["bow"],
    트래퍼: ["bow"],
    호크아이: ["bow"],
    그림트래퍼: ["bow"],
    천궁성: ["bow"],
    나이트메어헌트: ["bow"],
    버서커: ["axe"],
    워브레이커: ["axe"],
    데스브링어: ["axe"],
    월드이터: ["axe"],
    오라클: ["focus"],
    세라핌: ["focus"],
    인퀴지터: ["focus"],
    성녀: ["focus"],
    아크저지: ["focus"]
  });

  Object.assign(CLASS_ROLE_META, {
    블레이드로드: { role: "공세형 검 지휘관", summary: "빠른 검술과 돌파력에 치중한 검 전열입니다.", strengths: "선공 화력, 기동전, 응급 회복", caution: "순수 탱킹은 하이로드 계열보다 약합니다." },
    소드마스터: { role: "속공형 검객", summary: "정확도와 속도를 끌어올린 상급 결투사입니다.", strengths: "명중, 추격, 단일 격파", caution: "받아내는 힘은 중장형보다 낮습니다." },
    엠퍼러: { role: "황제형 전열", summary: "지휘와 화력을 모두 갖춘 상급 군주입니다.", strengths: "선공 압박, 안정적인 전열 유지", caution: "극단적인 회피전에는 특화되지 않습니다." },
    검성: { role: "극의 검객", summary: "치명적인 일격과 속공에 특화된 검술가입니다.", strengths: "정밀 격파, 폭딜, 기동 추격", caution: "방어적인 장기전은 불리합니다." },
    오버로드: { role: "패왕형 선봉", summary: "전장을 압도하는 최상위 검 전열입니다.", strengths: "높은 화력, 강한 선공, 안정성", caution: "후열 지원 능력은 성직 계열보다 낮습니다." },
    스타블레이드: { role: "궁극 검격수", summary: "초고속 일격으로 적 핵심을 제거하는 최상위 검객입니다.", strengths: "암살, 추격, 고명중 폭딜", caution: "포위되면 오래 버티기 어렵습니다." },
    가디언: { role: "중장 수호자", summary: "순수 수비에 특화된 창 전열입니다.", strengths: "길목 봉쇄, 버티기, 방어 버프", caution: "추격과 순간 화력은 낮습니다." },
    센티넬: { role: "감시 전열", summary: "라인 유지와 대응 안정성에 강한 수비 창병입니다.", strengths: "안정 대응, 방어전, 아군 보호", caution: "기동 돌파력은 약합니다." },
    홀리랜서: { role: "성창 기사", summary: "창 전열에 신성한 돌파력을 더한 성기사입니다.", strengths: "단단함, 선공 돌격, 균형형 운용", caution: "원거리 화력은 활 계열에 밀립니다." },
    포트리스: { role: "요새 전열", summary: "압도적인 방어로 전선을 고정하는 중장 창병입니다.", strengths: "최전선 유지, 버프, 생존력", caution: "속도와 공격 템포는 둔합니다." },
    아크랜서: { role: "최상위 성창", summary: "공방 밸런스가 완성된 최상급 성창 기사입니다.", strengths: "안정적 탱킹, 돌격, 전선 유지", caution: "극딜 특화 병종은 아닙니다." },
    이지스로드: { role: "절대 방벽", summary: "거의 무너지지 않는 최상위 방벽 전열입니다.", strengths: "최고 수준 생존력, 길목 장악", caution: "공격 마무리는 후열 보조가 필요합니다." },
    레인저: { role: "기동 궁수", summary: "위치 선점과 연속 사격에 능한 기동형 궁수입니다.", strengths: "안전딜, 각도 선점, 정확도", caution: "붙잡히면 급격히 약해집니다." },
    트래퍼: { role: "교란 사수", summary: "숲과 거리 조절에 강한 교란형 사격수입니다.", strengths: "지형 활용, 견제, 후열 압박", caution: "순수 화력은 스나이퍼보다 낮습니다." },
    호크아이: { role: "상급 원거리 사수", summary: "장거리 정밀 화력을 극대화한 상급 활 병종입니다.", strengths: "정확한 저격, 안전한 마무리", caution: "근접 위기 관리가 필요합니다." },
    그림트래퍼: { role: "암영 사냥꾼", summary: "표식과 기습에 특화된 음영형 헌터입니다.", strengths: "기습, 지형전, 표적 처치", caution: "정면 교전 유지력은 낮습니다." },
    천궁성: { role: "궁극 사수", summary: "전장을 꿰뚫는 최상급 궁사입니다.", strengths: "최고 수준 원거리 압박, 마무리", caution: "전열 보호 없이는 불안정합니다." },
    나이트메어헌트: { role: "악몽 추적자", summary: "은신과 사냥에 가까운 최상급 헌터입니다.", strengths: "추격, 암살, 불규칙 교전", caution: "버티는 힘은 중장형보다 크게 낮습니다." },
    버서커: { role: "광전 파쇄자", summary: "맞물리면 거칠게 밀어붙이는 상급 도끼병입니다.", strengths: "고화력, 선공 폭발력", caution: "명중 안정성이 낮습니다." },
    워브레이커: { role: "중장 파괴자", summary: "방어선 붕괴에 특화된 도끼 전사입니다.", strengths: "고방 적 압박, 강타", caution: "빠른 적에게 빗맞기 쉽습니다." },
    데스브링어: { role: "죽음의 도끼수", summary: "한 번 닿으면 치명적인 상급 파쇄자입니다.", strengths: "순간 폭딜, 체력 삭제", caution: "기동성과 명중은 여전히 불안합니다." },
    월드이터: { role: "재앙형 도끼수", summary: "모든 것을 쪼개는 최상위 파괴자입니다.", strengths: "최고 수준 강타, 보스 압박", caution: "회피전과 선제 견제에 약합니다." },
    오라클: { role: "예지 성직자", summary: "회복과 공격 마법을 함께 다루는 예지형 성직자입니다.", strengths: "지원과 공격의 균형, 안정적인 명중", caution: "집중 포화에 취약합니다." },
    세라핌: { role: "천사형 치유사", summary: "대규모 회복과 안정 지원에 특화된 상급 힐러입니다.", strengths: "강한 회복, 유지력, 후열 안정", caution: "직접 타격 화력은 제한적입니다." },
    인퀴지터: { role: "심판 성직자", summary: "성광 공격에 더 치우친 상급 성직자입니다.", strengths: "성속성 화력, 적 저격, 보조 회복", caution: "순수 치유량은 비숍 계열보다 낮습니다." },
    성녀: { role: "궁극 성직자", summary: "회복과 생존 지원의 정점에 선 성직자입니다.", strengths: "최상위 회복, 아군 유지, 안정성", caution: "혼자 전선을 밀기에는 화력이 부족합니다." },
    아크저지: { role: "종말 심판자", summary: "성광 심판으로 적 핵심을 삭제하는 최상위 성직자입니다.", strengths: "긴 사거리 심판, 명중, 보조 치유", caution: "전담 탱커 없이 전면에 설 수는 없습니다." }
  });

  Object.assign(CLASS_SKILLS, {
    블레이드로드: [
      {
        id: "blade_lord_rush",
        name: "질풍 통솔",
        description: "선공 시 명중 +8, 피해 +2",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { hitBonus: 8, attackPowerBonus: 2 } : null;
        }
      }
    ],
    소드마스터: [
      {
        id: "swordmaster_flow",
        name: "유수검",
        description: "공격 시 명중 +10",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 10 };
        }
      }
    ],
    엠퍼러: [
      {
        id: "emperor_command",
        name: "황제의 진군",
        description: "선공 시 피해 +3, 방어 +1",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 3, defenseBonus: 1 } : null;
        }
      }
    ],
    검성: [
      {
        id: "kensai_edge",
        name: "극의 예리",
        description: "공격 시 명중 +10, 피해 +2",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 10, attackPowerBonus: 2 };
        }
      }
    ],
    오버로드: [
      {
        id: "overlord_domination",
        name: "패왕의 압도",
        description: "선공 시 피해 +4, 명중 +8",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 4, hitBonus: 8 } : null;
        }
      }
    ],
    스타블레이드: [
      {
        id: "starblade_afterimage",
        name: "성광 잔상",
        description: "공격 시 명중 +12, 회피 +6",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 12, avoidBonus: 6 };
        }
      }
    ],
    가디언: [
      {
        id: "guardian_frame",
        name: "수호 골격",
        description: "방어 시 방어 +3",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 3 };
        }
      }
    ],
    센티넬: [
      {
        id: "sentinel_watch",
        name: "감시 초소",
        description: "방어 시 명중 +8, 방어 +2",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 2, hitBonus: 8 };
        }
      }
    ],
    홀리랜서: [
      {
        id: "holy_lancer_drive",
        name: "성창 돌격",
        description: "선공 시 명중 +8, 피해 +2",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { hitBonus: 8, attackPowerBonus: 2 } : null;
        }
      }
    ],
    포트리스: [
      {
        id: "fortress_plate",
        name: "요새 장갑",
        description: "방어 시 방어 +4",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 4 };
        }
      }
    ],
    아크랜서: [
      {
        id: "arclancer_charge",
        name: "성역 돌파",
        description: "선공 시 피해 +3, 방어 +2",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 3, defenseBonus: 2 } : null;
        }
      }
    ],
    이지스로드: [
      {
        id: "aegis_lord_bastion",
        name: "절대 방벽",
        description: "방어 시 방어 +5, 회피 +4",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 5, avoidBonus: 4 };
        }
      }
    ],
    레인저: [
      {
        id: "ranger_stride",
        name: "유동 사격",
        description: "원거리 공격 시 명중 +8, 회피 +6",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.distance >= 2 ? { hitBonus: 8, avoidBonus: 6 } : null;
        }
      }
    ],
    트래퍼: [
      {
        id: "trapper_camouflage",
        name: "포식자 위장",
        description: "숲에서 공격 시 명중 +10, 회피 +8",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.attackerTileType === "forest" ? { hitBonus: 10, avoidBonus: 8 } : null;
        }
      }
    ],
    호크아이: [
      {
        id: "hawkeye_lock",
        name: "천리 조준",
        description: "원거리 공격 시 명중 +12, 피해 +1",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.distance >= 2 ? { hitBonus: 12, attackPowerBonus: 1 } : null;
        }
      }
    ],
    그림트래퍼: [
      {
        id: "grim_trapper_mark",
        name: "암영 표식",
        description: "숲이나 고지에서 공격 시 피해 +2, 명중 +8",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.attackerTileType === "forest" || context.attackerTileType === "hill"
            ? { attackPowerBonus: 2, hitBonus: 8 }
            : null;
        }
      }
    ],
    천궁성: [
      {
        id: "celestial_archer",
        name: "천궁 관측",
        description: "원거리 공격 시 명중 +14, 피해 +2",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.distance >= 2 ? { hitBonus: 14, attackPowerBonus: 2 } : null;
        }
      }
    ],
    나이트메어헌트: [
      {
        id: "nightmare_hunt_step",
        name: "악몽 추적",
        description: "숲이나 고지에서 공격 시 피해 +3, 회피 +8",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.attackerTileType === "forest" || context.attackerTileType === "hill"
            ? { attackPowerBonus: 3, avoidBonus: 8 }
            : null;
        }
      }
    ],
    버서커: [
      {
        id: "berserker_fury",
        name: "광전 격노",
        description: "선공 시 피해 +4",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 4 } : null;
        }
      }
    ],
    워브레이커: [
      {
        id: "warbreaker_crush",
        name: "중갑 분쇄",
        description: "공격 시 피해 +3",
        unlockLevel: 1,
        attackerEffect() {
          return { attackPowerBonus: 3 };
        }
      }
    ],
    데스브링어: [
      {
        id: "deathbringer_aura",
        name: "살육 기류",
        description: "선공 시 피해 +5",
        unlockLevel: 1,
        attackerEffect(context) {
          return context.isInitiator ? { attackPowerBonus: 5 } : null;
        }
      }
    ],
    월드이터: [
      {
        id: "worldeater_break",
        name: "멸계 파쇄",
        description: "공격 시 피해 +6, 명중 +4",
        unlockLevel: 1,
        attackerEffect() {
          return { attackPowerBonus: 6, hitBonus: 4 };
        }
      }
    ],
    오라클: [
      {
        id: "oracle_rhythm",
        name: "예지 공명",
        description: "공격 시 명중 +10",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 10 };
        }
      }
    ],
    세라핌: [
      {
        id: "seraph_guard",
        name: "천사의 수호",
        description: "방어 시 방어 +2, 회피 +8",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 2, avoidBonus: 8 };
        }
      }
    ],
    인퀴지터: [
      {
        id: "inquisitor_sentence",
        name: "심판 선고",
        description: "공격 시 명중 +10, 피해 +2",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 10, attackPowerBonus: 2 };
        }
      }
    ],
    성녀: [
      {
        id: "saint_domain",
        name: "성녀의 권역",
        description: "방어 시 방어 +3, 회피 +8",
        unlockLevel: 1,
        defenderEffect() {
          return { defenseBonus: 3, avoidBonus: 8 };
        }
      }
    ],
    아크저지: [
      {
        id: "arc_judgment",
        name: "절대 심판",
        description: "공격 시 명중 +12, 피해 +3",
        unlockLevel: 1,
        attackerEffect() {
          return { hitBonus: 12, attackPowerBonus: 3 };
        }
      }
    ]
  });

  Object.assign(PROMOTION_TREE, {
    로드: [
      { className: "하이로드", unlockLevel: 10, description: "균형형 상급 지휘관. 공방 균형과 회복 보조가 강화된다.", statBonuses: { maxHp: 2, str: 2, skl: 1, spd: 1, def: 1, mov: 1 } },
      { className: "블레이드로드", unlockLevel: 10, description: "공세형 검 지휘관. 더 빠르고 날카로운 돌파력을 얻는다.", statBonuses: { maxHp: 1, str: 2, skl: 2, spd: 2, def: 0, mov: 1 } }
    ],
    검사: [
      { className: "소드마스터", unlockLevel: 10, description: "속도와 정밀도에 특화된 상급 검사.", statBonuses: { maxHp: 1, str: 1, skl: 2, spd: 2, def: 0, mov: 1 } },
      { className: "블레이드로드", unlockLevel: 10, description: "지휘와 돌파를 겸하는 검 전열.", statBonuses: { maxHp: 2, str: 2, skl: 1, spd: 1, def: 1, mov: 1 } }
    ],
    랜서: [
      { className: "팔라딘", unlockLevel: 10, description: "균형형 상급 창 기사.", statBonuses: { maxHp: 2, str: 1, skl: 1, spd: 1, def: 2, mov: 1 } },
      { className: "가디언", unlockLevel: 10, description: "요새형 방어 전열.", statBonuses: { maxHp: 3, str: 1, skl: 0, spd: 0, def: 3, mov: 0 } }
    ],
    솔저: [
      { className: "센티넬", unlockLevel: 10, description: "대응력 높은 감시 전열.", statBonuses: { maxHp: 2, str: 1, skl: 1, spd: 1, def: 2, mov: 0 } },
      { className: "가디언", unlockLevel: 10, description: "방어 일변도의 중장 전열.", statBonuses: { maxHp: 3, str: 1, skl: 0, spd: 0, def: 3, mov: 0 } }
    ],
    아처: [
      { className: "스나이퍼", unlockLevel: 10, description: "정밀 저격에 특화된 상급 궁수.", statBonuses: { maxHp: 1, str: 2, skl: 2, spd: 1, def: 1, mov: 1 } },
      { className: "레인저", unlockLevel: 10, description: "기동 사격과 위치 선점에 강한 활 병종.", statBonuses: { maxHp: 1, str: 1, skl: 2, spd: 2, def: 0, mov: 1 } }
    ],
    헌터: [
      { className: "트래퍼", unlockLevel: 10, description: "교란과 지형전에 능한 사냥꾼.", statBonuses: { maxHp: 1, str: 1, skl: 2, spd: 2, def: 0, mov: 1 } },
      { className: "레인저", unlockLevel: 10, description: "안정적인 상급 기동 궁수.", statBonuses: { maxHp: 1, str: 1, skl: 2, spd: 2, def: 0, mov: 1 } }
    ],
    브리건드: [
      { className: "버서커", unlockLevel: 10, description: "광전 돌파형 도끼수.", statBonuses: { maxHp: 2, str: 3, skl: 0, spd: 1, def: 1, mov: 0 } },
      { className: "워브레이커", unlockLevel: 10, description: "중장 파쇄 특화 도끼수.", statBonuses: { maxHp: 3, str: 2, skl: 1, spd: 0, def: 1, mov: 0 } }
    ],
    클레릭: [
      { className: "비숍", unlockLevel: 10, description: "회복과 성광 지원을 강화한 상급 힐러.", statBonuses: { maxHp: 2, str: 1, skl: 2, spd: 1, def: 1, mov: 1 } },
      { className: "오라클", unlockLevel: 10, description: "예지와 심판 공격을 겸하는 성직자.", statBonuses: { maxHp: 1, str: 2, skl: 2, spd: 1, def: 0, mov: 1 } }
    ],
    하이로드: [{ className: "엠퍼러", unlockLevel: 30, description: "황제형 최상급 지휘관.", statBonuses: { maxHp: 3, str: 2, skl: 2, spd: 1, def: 2, mov: 1 } }],
    블레이드로드: [{ className: "검성", unlockLevel: 30, description: "검의 극의에 닿은 상급 검객.", statBonuses: { maxHp: 2, str: 2, skl: 2, spd: 2, def: 0, mov: 1 } }],
    소드마스터: [{ className: "검성", unlockLevel: 30, description: "검의 극의에 닿은 상급 검객.", statBonuses: { maxHp: 2, str: 2, skl: 2, spd: 2, def: 0, mov: 1 } }],
    팔라딘: [{ className: "홀리랜서", unlockLevel: 30, description: "성창 돌격을 익힌 상급 기사.", statBonuses: { maxHp: 3, str: 2, skl: 1, spd: 1, def: 2, mov: 1 } }],
    가디언: [{ className: "포트리스", unlockLevel: 30, description: "전장을 고정하는 요새 전열.", statBonuses: { maxHp: 4, str: 1, skl: 0, spd: 0, def: 3, mov: 0 } }],
    센티넬: [{ className: "포트리스", unlockLevel: 30, description: "전장을 고정하는 요새 전열.", statBonuses: { maxHp: 4, str: 1, skl: 0, spd: 0, def: 3, mov: 0 } }],
    스나이퍼: [{ className: "호크아이", unlockLevel: 30, description: "시야와 사거리 운용을 완성한 사수.", statBonuses: { maxHp: 2, str: 2, skl: 3, spd: 1, def: 0, mov: 1 } }],
    레인저: [{ className: "호크아이", unlockLevel: 30, description: "시야와 사거리 운용을 완성한 사수.", statBonuses: { maxHp: 2, str: 2, skl: 3, spd: 1, def: 0, mov: 1 } }],
    트래퍼: [{ className: "그림트래퍼", unlockLevel: 30, description: "암영 추적과 기습을 익힌 사수.", statBonuses: { maxHp: 2, str: 2, skl: 2, spd: 2, def: 0, mov: 1 } }],
    버서커: [{ className: "데스브링어", unlockLevel: 30, description: "파괴를 극단까지 끌어올린 도끼수.", statBonuses: { maxHp: 3, str: 3, skl: 0, spd: 1, def: 1, mov: 0 } }],
    워브레이커: [{ className: "데스브링어", unlockLevel: 30, description: "파괴를 극단까지 끌어올린 도끼수.", statBonuses: { maxHp: 3, str: 3, skl: 0, spd: 1, def: 1, mov: 0 } }],
    비숍: [{ className: "세라핌", unlockLevel: 30, description: "광역 회복과 수호에 능한 상급 성직자.", statBonuses: { maxHp: 2, str: 1, skl: 2, spd: 1, def: 1, mov: 1 } }],
    오라클: [{ className: "인퀴지터", unlockLevel: 30, description: "심판과 예지를 강화한 성직자.", statBonuses: { maxHp: 2, str: 2, skl: 2, spd: 1, def: 0, mov: 1 } }],
    엠퍼러: [{ className: "오버로드", unlockLevel: 70, description: "최상위 패왕형 선봉.", statBonuses: { maxHp: 4, str: 3, skl: 2, spd: 1, def: 2, mov: 1 } }],
    검성: [{ className: "스타블레이드", unlockLevel: 70, description: "별빛 검격에 도달한 궁극 검객.", statBonuses: { maxHp: 3, str: 2, skl: 3, spd: 3, def: 0, mov: 1 } }],
    홀리랜서: [{ className: "아크랜서", unlockLevel: 70, description: "성창 돌격의 정점에 선 기사.", statBonuses: { maxHp: 4, str: 2, skl: 2, spd: 1, def: 2, mov: 1 } }],
    포트리스: [{ className: "이지스로드", unlockLevel: 70, description: "절대 방벽에 가까운 최상위 전열.", statBonuses: { maxHp: 5, str: 1, skl: 0, spd: 0, def: 4, mov: 0 } }],
    호크아이: [{ className: "천궁성", unlockLevel: 70, description: "하늘을 꿰뚫는 궁극 사수.", statBonuses: { maxHp: 2, str: 3, skl: 3, spd: 2, def: 0, mov: 1 } }],
    그림트래퍼: [{ className: "나이트메어헌트", unlockLevel: 70, description: "악몽처럼 사라졌다 나타나는 추적자.", statBonuses: { maxHp: 2, str: 2, skl: 3, spd: 3, def: 0, mov: 1 } }],
    데스브링어: [{ className: "월드이터", unlockLevel: 70, description: "모든 방어를 찢는 재앙형 도끼수.", statBonuses: { maxHp: 4, str: 4, skl: 0, spd: 1, def: 1, mov: 0 } }],
    세라핌: [{ className: "성녀", unlockLevel: 70, description: "최상위 회복과 수호의 성직자.", statBonuses: { maxHp: 3, str: 1, skl: 2, spd: 1, def: 1, mov: 1 } }],
    인퀴지터: [{ className: "아크저지", unlockLevel: 70, description: "종말 심판을 내리는 최상위 성직자.", statBonuses: { maxHp: 3, str: 2, skl: 3, spd: 1, def: 0, mov: 1 } }]
  });

  const MAX_EQUIPPED_ACTIVE_SKILLS = 3;
  const MAX_SKILL_LEVEL = 5;
  const PRIMARY_STAT_LABELS = {
    str: "STR",
    dex: "DEX",
    vit: "VIT",
    int: "INT",
    luk: "LUK"
  };
  const SKILL_LABELS = {
    attackPowerBonus: "공격력",
    defenseBonus: "방어",
    hitBonus: "명중",
    avoidBonus: "회피"
  };
  const ATTACK_SCALING_PROFILES = {
    sword: {
      damage: { str: 0.18, dex: 0.08, int: 0.06, luk: 0.04 },
      hit: { dex: 0.52, int: 0.16, luk: 0.12 },
      damagePerLevel: 1,
      hitPerLevel: 3
    },
    lance: {
      damage: { str: 0.16, vit: 0.08, dex: 0.06, int: 0.04 },
      hit: { dex: 0.4, int: 0.14, luk: 0.1 },
      damagePerLevel: 1,
      hitPerLevel: 2
    },
    axe: {
      damage: { str: 0.22, vit: 0.08, dex: 0.03, int: 0.03 },
      hit: { dex: 0.28, int: 0.08, luk: 0.1 },
      damagePerLevel: 1,
      hitPerLevel: 2
    },
    bow: {
      damage: { dex: 0.18, str: 0.06, int: 0.06, luk: 0.06 },
      hit: { dex: 0.58, int: 0.12, luk: 0.18 },
      damagePerLevel: 1,
      hitPerLevel: 3
    },
    focus: {
      damage: { int: 0.24, luk: 0.08, dex: 0.06, vit: 0.04 },
      hit: { int: 0.48, dex: 0.28, luk: 0.16 },
      damagePerLevel: 2,
      hitPerLevel: 3
    },
    default: {
      damage: { str: 0.16, dex: 0.08, int: 0.06, luk: 0.04 },
      hit: { dex: 0.46, int: 0.14, luk: 0.12 },
      damagePerLevel: 1,
      hitPerLevel: 2
    }
  };
  const HEAL_SCALING_PROFILE = {
    amount: { int: 0.42, luk: 0.16, vit: 0.08 },
    amountPerLevel: 2
  };
  const BUFF_SCALING_PROFILES = {
    attackPowerBonus: {
      stats: { str: 0.08, int: 0.04, luk: 0.03 },
      perLevel: 1
    },
    defenseBonus: {
      stats: { vit: 0.09, str: 0.03, int: 0.03 },
      perLevel: 1
    },
    hitBonus: {
      stats: { dex: 0.35, int: 0.12, luk: 0.08 },
      perLevel: 2
    },
    avoidBonus: {
      stats: { dex: 0.22, luk: 0.1, int: 0.06 },
      perLevel: 2
    }
  };
  const PASSIVE_SKILL_MAP = {};
  const ACTIVE_SKILL_MAP = {};
  const ALL_SKILL_MAP = {};

  Object.keys(CLASS_SKILLS).forEach((className) => {
    (CLASS_SKILLS[className] || []).forEach((skill) => {
      PASSIVE_SKILL_MAP[skill.id] = Object.assign({ sourceClassName: className, skillType: "passive" }, skill);
      ALL_SKILL_MAP[skill.id] = PASSIVE_SKILL_MAP[skill.id];
    });
  });

  Object.keys(CLASS_ACTIVE_SKILLS).forEach((className) => {
    (CLASS_ACTIVE_SKILLS[className] || []).forEach((skill) => {
      ACTIVE_SKILL_MAP[skill.id] = Object.assign({ sourceClassName: className, skillType: "active" }, skill);
      ALL_SKILL_MAP[skill.id] = ACTIVE_SKILL_MAP[skill.id];
    });
  });

  Object.keys(SPECIAL_SKILLS).forEach((skillId) => {
    PASSIVE_SKILL_MAP[skillId] = Object.assign({ sourceClassName: "special", skillType: "passive", isSpecial: true }, SPECIAL_SKILLS[skillId]);
    ALL_SKILL_MAP[skillId] = PASSIVE_SKILL_MAP[skillId];
  });

  Object.keys(SPECIAL_ACTIVE_SKILLS).forEach((skillId) => {
    ACTIVE_SKILL_MAP[skillId] = Object.assign({ sourceClassName: "special", skillType: "active", isSpecial: true }, SPECIAL_ACTIVE_SKILLS[skillId]);
    ALL_SKILL_MAP[skillId] = ACTIVE_SKILL_MAP[skillId];
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getPrimaryStats(unit) {
    return Object.assign({
      str: 0,
      dex: 0,
      vit: 0,
      int: 0,
      luk: 0
    }, unit && unit.primaryStats ? unit.primaryStats : {});
  }

  function getSkillLevel(unit, skillId) {
    normalizeUnitLearnedSkills(unit);
    return Math.max(1, Number(unit.skillLevels && unit.skillLevels[skillId] || 1));
  }

  function getSkillMaxLevel(unit) {
    return clamp(1 + Math.floor((Math.max(1, Number(unit && unit.level || 1)) - 1) / 2), 1, MAX_SKILL_LEVEL);
  }

  function getGlobalSkillDefinition(skillId) {
    return ALL_SKILL_MAP[skillId] || null;
  }

  function decorateSkillForUnit(unit, skill) {
    if (!skill) {
      return null;
    }

    const copy = clone(skill);
    copy.skillLevel = getSkillLevel(unit, copy.id);
    copy.maxSkillLevel = getSkillMaxLevel(unit, copy);
    copy.canLevelUp = copy.skillType === "active"
      && !copy.isSpecial
      && copy.skillLevel < copy.maxSkillLevel
      && (unit.skillPoints || 0) > 0;
    return copy;
  }

  function buildScaledBreakdown(baseValue, coefficientMap, primaryStats, perLevelValue, skillLevel) {
    const parts = [];
    let total = Number(baseValue || 0);

    if (baseValue) {
      parts.push({ label: "기본", value: Number(baseValue || 0) });
    }

    Object.keys(coefficientMap || {}).forEach((statName) => {
      const coefficient = Number(coefficientMap[statName] || 0);

      if (!coefficient) {
        return;
      }

      const contribution = Math.round(Number(primaryStats[statName] || 0) * coefficient);

      if (!contribution) {
        return;
      }

      total += contribution;
      parts.push({
        label: `${PRIMARY_STAT_LABELS[statName] || statName.toUpperCase()} x${coefficient.toFixed(2)}`,
        value: contribution
      });
    });

    const levelBonus = Math.max(0, Number(skillLevel || 1) - 1) * Number(perLevelValue || 0);

    if (levelBonus) {
      total += levelBonus;
      parts.push({
        label: `스킬 Lv 보정`,
        value: levelBonus
      });
    }

    return {
      total: Math.max(0, Math.round(total)),
      parts
    };
  }

  function formatScaledBreakdown(breakdown) {
    if (!breakdown || !Array.isArray(breakdown.parts) || !breakdown.parts.length) {
      return "없음";
    }

    return breakdown.parts.map((part) => `${part.label} +${part.value}`).join(" / ");
  }

  function getAttackScalingProfile(unit) {
    const weaponType = (unit.weapon && unit.weapon.type)
      || getClassWeaponType(unit.className)
      || "default";
    return ATTACK_SCALING_PROFILES[weaponType] || ATTACK_SCALING_PROFILES.default;
  }

  function buildAttackSkillPerformance(unit, skill) {
    const profile = getAttackScalingProfile(unit);
    const primaryStats = getPrimaryStats(unit);
    const damageBreakdown = buildScaledBreakdown(
      skill.effect && skill.effect.damageBonus || 0,
      profile.damage,
      primaryStats,
      profile.damagePerLevel,
      skill.skillLevel
    );
    const hitBreakdown = buildScaledBreakdown(
      skill.effect && skill.effect.hitBonus || 0,
      profile.hit,
      primaryStats,
      profile.hitPerLevel,
      skill.skillLevel
    );

    return {
      kind: "attack",
      damageBonus: damageBreakdown.total,
      hitBonus: hitBreakdown.total,
      damageBreakdown,
      hitBreakdown,
      currentSummary: `추가 피해 +${damageBreakdown.total} / 명중 +${hitBreakdown.total}`,
      formulaLines: [
        `피해 계수: ${formatScaledBreakdown(damageBreakdown)}`,
        `명중 계수: ${formatScaledBreakdown(hitBreakdown)}`
      ]
    };
  }

  function buildHealSkillPerformance(unit, skill) {
    const primaryStats = getPrimaryStats(unit);
    const amountBreakdown = buildScaledBreakdown(
      skill.effect && skill.effect.amount || 0,
      HEAL_SCALING_PROFILE.amount,
      primaryStats,
      HEAL_SCALING_PROFILE.amountPerLevel,
      skill.skillLevel
    );

    return {
      kind: "heal",
      amount: amountBreakdown.total,
      amountBreakdown,
      currentSummary: `현재 회복량 ${amountBreakdown.total}`,
      formulaLines: [`회복 계수: ${formatScaledBreakdown(amountBreakdown)}`]
    };
  }

  function buildBuffSkillPerformance(unit, skill) {
    const primaryStats = getPrimaryStats(unit);
    const buff = skill.effect && skill.effect.buff ? skill.effect.buff : {};
    const entries = Object.keys(SKILL_LABELS)
      .filter((key) => Number(buff[key] || 0) !== 0)
      .map((key) => {
        const scalingProfile = BUFF_SCALING_PROFILES[key] || { stats: {}, perLevel: 0 };
        const breakdown = buildScaledBreakdown(
          buff[key] || 0,
          scalingProfile.stats,
          primaryStats,
          scalingProfile.perLevel,
          skill.skillLevel
        );

        return {
          key,
          label: SKILL_LABELS[key],
          value: breakdown.total,
          breakdown
        };
      });

    return {
      kind: "buff",
      entries,
      currentSummary: entries.length
        ? entries.map((entry) => `${entry.label} +${entry.value}`).join(" / ")
        : "버프 수치 없음",
      formulaLines: entries.map((entry) => `${entry.label} 계수: ${formatScaledBreakdown(entry.breakdown)}`)
    };
  }

  function getSkillPerformance(unit, skillOrId) {
    const skill = typeof skillOrId === "string"
      ? decorateSkillForUnit(unit, getGlobalSkillDefinition(skillOrId))
      : decorateSkillForUnit(unit, skillOrId);

    if (!skill || !skill.effect) {
      return null;
    }

    if (skill.effect.kind === "attack") {
      return buildAttackSkillPerformance(unit, skill);
    }

    if (skill.effect.kind === "heal") {
      return buildHealSkillPerformance(unit, skill);
    }

    if (skill.effect.kind === "buff") {
      return buildBuffSkillPerformance(unit, skill);
    }

    return null;
  }

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
      .map((skillId) => decorateSkillForUnit(unit, PASSIVE_SKILL_MAP[skillId]))
      .filter(Boolean);
  }

  function getSpecialActiveSkills(unit) {
    return (unit.specialActiveSkillIds || [])
      .map((skillId) => decorateSkillForUnit(unit, ACTIVE_SKILL_MAP[skillId]))
      .filter(Boolean);
  }

  function normalizeUnitLearnedSkills(unit) {
    if (!unit) {
      return unit;
    }

    unit.specialSkillIds = Array.isArray(unit.specialSkillIds) ? unit.specialSkillIds : [];
    unit.specialActiveSkillIds = Array.isArray(unit.specialActiveSkillIds) ? unit.specialActiveSkillIds : [];
    unit.grantedMilestoneSkillLevels = Array.isArray(unit.grantedMilestoneSkillLevels)
      ? unit.grantedMilestoneSkillLevels
      : [];

    if (!Array.isArray(unit.learnedSkillIds)) {
      unit.learnedSkillIds = (CLASS_SKILLS[unit.className] || [])
        .filter((skill) => (unit.level || 1) >= skill.unlockLevel)
        .map((skill) => skill.id);
    }

    if (!Array.isArray(unit.learnedActiveSkillIds)) {
      unit.learnedActiveSkillIds = (CLASS_ACTIVE_SKILLS[unit.className] || [])
        .filter((skill) => (unit.level || 1) >= skill.unlockLevel)
        .map((skill) => skill.id);
    }

    unit.learnedSkillIds = Array.from(new Set(unit.learnedSkillIds));
    unit.learnedActiveSkillIds = Array.from(new Set(unit.learnedActiveSkillIds));
    unit.skillLevels = unit.skillLevels && typeof unit.skillLevels === "object" ? unit.skillLevels : {};
    unit.learnedSkillIds.concat(unit.learnedActiveSkillIds).forEach((skillId) => {
      unit.skillLevels[skillId] = Math.max(1, Number(unit.skillLevels[skillId] || 1));
    });

    if (!Array.isArray(unit.equippedActiveSkillIds)) {
      unit.equippedActiveSkillIds = unit.learnedActiveSkillIds.slice(0, MAX_EQUIPPED_ACTIVE_SKILLS);
    }

    unit.equippedActiveSkillIds = unit.equippedActiveSkillIds
      .filter((skillId) => unit.learnedActiveSkillIds.includes(skillId) || (unit.specialActiveSkillIds || []).includes(skillId))
      .slice(0, MAX_EQUIPPED_ACTIVE_SKILLS);
    unit.skillPoints = Math.max(0, Number(unit.skillPoints || 0));

    if ((unit.level || 1) >= 5 && !unit.grantedMilestoneSkillLevels.includes(5)) {
      grantRandomMilestoneSkill(unit, 5);
    }

    return unit;
  }

  function normalizeRosterLearnedSkills(saveData) {
    if (!saveData || !saveData.roster) {
      return saveData;
    }

    saveData.roster.forEach((unit) => normalizeUnitLearnedSkills(unit));
    return saveData;
  }

  function getLearnedClassSkills(unit) {
    normalizeUnitLearnedSkills(unit);
    return unit.learnedSkillIds
      .map((skillId) => decorateSkillForUnit(unit, PASSIVE_SKILL_MAP[skillId]))
      .filter(Boolean);
  }

  function getLearnedClassActiveSkills(unit) {
    normalizeUnitLearnedSkills(unit);
    return unit.learnedActiveSkillIds
      .map((skillId) => decorateSkillForUnit(unit, ACTIVE_SKILL_MAP[skillId]))
      .filter(Boolean);
  }

  function getSkillsForUnit(unit) {
    return getLearnedClassSkills(unit)
      .concat(getSpecialSkills(unit))
      .filter((skill) => (unit.level || 1) >= skill.unlockLevel);
  }

  function getActiveSkillsForUnit(unit) {
    return getLearnedClassActiveSkills(unit)
      .concat(getSpecialActiveSkills(unit))
      .filter((skill) => (unit.level || 1) >= skill.unlockLevel);
  }

  function getEquippedActiveSkillsForUnit(unit, options) {
    normalizeUnitLearnedSkills(unit);
    const nextOptions = options || {};
    const allActiveSkills = getActiveSkillsForUnit(unit);
    const allMap = {};

    allActiveSkills.forEach((skill) => {
      allMap[skill.id] = skill;
    });

    if (nextOptions.ignoreSlotLimit || unit.team === "enemy") {
      return allActiveSkills;
    }

    return (unit.equippedActiveSkillIds || [])
      .map((skillId) => allMap[skillId])
      .filter(Boolean)
      .slice(0, MAX_EQUIPPED_ACTIVE_SKILLS);
  }

  function getActiveSkillLoadout(unit, options) {
    normalizeUnitLearnedSkills(unit);
    const nextOptions = options || {};
    const equippedSkills = getEquippedActiveSkillsForUnit(unit, nextOptions);
    const skillMap = {};

    equippedSkills.forEach((skill) => {
      skillMap[skill.id] = skill;
    });

    const slots = [];

    for (let index = 0; index < MAX_EQUIPPED_ACTIVE_SKILLS; index += 1) {
      const skillId = unit.equippedActiveSkillIds[index] || null;
      slots.push(skillId ? skillMap[skillId] || null : null);
    }

    return slots;
  }

  function getLearnableSkills(unit) {
    normalizeUnitLearnedSkills(unit);
    return (CLASS_SKILLS[unit.className] || []).filter(
      (skill) => (unit.level || 1) >= skill.unlockLevel && !unit.learnedSkillIds.includes(skill.id)
    );
  }

  function getLearnableActiveSkills(unit) {
    normalizeUnitLearnedSkills(unit);
    return (CLASS_ACTIVE_SKILLS[unit.className] || []).filter(
      (skill) => (unit.level || 1) >= skill.unlockLevel && !unit.learnedActiveSkillIds.includes(skill.id)
    );
  }

  function getSkillDefinition(unit, skillId) {
    return getGlobalSkillDefinition(skillId);
  }

  function grantSkillById(unit, skillId) {
    if (!unit) {
      return null;
    }

    unit.specialSkillIds = Array.isArray(unit.specialSkillIds) ? unit.specialSkillIds : [];
    unit.specialActiveSkillIds = Array.isArray(unit.specialActiveSkillIds) ? unit.specialActiveSkillIds : [];
    unit.equippedActiveSkillIds = Array.isArray(unit.equippedActiveSkillIds) ? unit.equippedActiveSkillIds : [];
    unit.skillLevels = unit.skillLevels && typeof unit.skillLevels === "object" ? unit.skillLevels : {};
    const passiveSkill = PASSIVE_SKILL_MAP[skillId];
    const activeSkill = ACTIVE_SKILL_MAP[skillId];

    if (passiveSkill) {
      if (!unit.specialSkillIds.includes(skillId) && !unit.learnedSkillIds.includes(skillId)) {
        unit.specialSkillIds.push(skillId);
      }

      return decorateSkillForUnit(unit, passiveSkill);
    }

    if (activeSkill) {
      if (!unit.specialActiveSkillIds.includes(skillId) && !unit.learnedActiveSkillIds.includes(skillId)) {
        unit.specialActiveSkillIds.push(skillId);
      }

      unit.skillLevels[skillId] = Math.max(1, Number(unit.skillLevels[skillId] || 1));

      if ((unit.equippedActiveSkillIds || []).length < MAX_EQUIPPED_ACTIVE_SKILLS && !unit.equippedActiveSkillIds.includes(skillId)) {
        unit.equippedActiveSkillIds.push(skillId);
      }

      return decorateSkillForUnit(unit, activeSkill);
    }

    return null;
  }

  function grantRandomMilestoneSkill(unit, milestoneLevel) {
    if (!unit) {
      return null;
    }

    unit.specialSkillIds = Array.isArray(unit.specialSkillIds) ? unit.specialSkillIds : [];
    unit.specialActiveSkillIds = Array.isArray(unit.specialActiveSkillIds) ? unit.specialActiveSkillIds : [];
    unit.grantedMilestoneSkillLevels = Array.isArray(unit.grantedMilestoneSkillLevels)
      ? unit.grantedMilestoneSkillLevels
      : [];

    if ((unit.level || 1) < milestoneLevel || unit.grantedMilestoneSkillLevels.includes(milestoneLevel)) {
      return null;
    }

    const weaponType = getClassWeaponType(unit.className);
    const pool = RANDOM_MILESTONE_SKILL_POOLS[weaponType] || [];
    const knownSkillIds = []
      .concat(unit.learnedSkillIds || [])
      .concat(unit.learnedActiveSkillIds || [])
      .concat(unit.specialSkillIds || [])
      .concat(unit.specialActiveSkillIds || []);
    const availableSkillIds = pool.filter((skillId) => !knownSkillIds.includes(skillId));
    unit.grantedMilestoneSkillLevels.push(milestoneLevel);

    if (!availableSkillIds.length) {
      return null;
    }

    const skillId = availableSkillIds[Math.floor(Math.random() * availableSkillIds.length)];
    return grantSkillById(unit, skillId);
  }

  function grantMilestoneRewardsForLevel(unit, previousLevel, newLevel) {
    const granted = [];

    if (previousLevel < 5 && newLevel >= 5) {
      const reward = grantRandomMilestoneSkill(unit, 5);

      if (reward) {
        granted.push(reward);
      }
    }

    return granted;
  }

  function isSkillLearned(unit, skillId) {
    normalizeUnitLearnedSkills(unit);
    return unit.learnedSkillIds.includes(skillId) || unit.learnedActiveSkillIds.includes(skillId);
  }

  function learnSkill(unit, skillId) {
    normalizeUnitLearnedSkills(unit);

    if ((unit.skillPoints || 0) <= 0) {
      throw new Error("남은 스킬 포인트가 없습니다.");
    }

    const passiveSkill = getLearnableSkills(unit).find((skill) => skill.id === skillId);

    if (passiveSkill) {
      unit.learnedSkillIds.push(passiveSkill.id);
      unit.skillPoints -= 1;
      return passiveSkill;
    }

    const activeSkill = getLearnableActiveSkills(unit).find((skill) => skill.id === skillId);

    if (activeSkill) {
      unit.learnedActiveSkillIds.push(activeSkill.id);
      unit.skillLevels[activeSkill.id] = 1;
      if ((unit.equippedActiveSkillIds || []).length < MAX_EQUIPPED_ACTIVE_SKILLS) {
        unit.equippedActiveSkillIds.push(activeSkill.id);
      }
      unit.skillPoints -= 1;
      return decorateSkillForUnit(unit, activeSkill);
    }

    throw new Error("배울 수 없는 스킬입니다.");
  }

  function canLevelSkill(unit, skillId) {
    normalizeUnitLearnedSkills(unit);

    if (!unit.learnedActiveSkillIds.includes(skillId)) {
      return false;
    }

    return getSkillLevel(unit, skillId) < getSkillMaxLevel(unit);
  }

  function upgradeSkill(unit, skillId) {
    normalizeUnitLearnedSkills(unit);

    if (!unit.learnedActiveSkillIds.includes(skillId)) {
      throw new Error("강화할 수 없는 액티브 스킬입니다.");
    }

    if ((unit.skillPoints || 0) <= 0) {
      throw new Error("남은 스킬 포인트가 없습니다.");
    }

    if (!canLevelSkill(unit, skillId)) {
      throw new Error("현재 레벨에서는 이 스킬을 더 강화할 수 없습니다.");
    }

    unit.skillLevels[skillId] = getSkillLevel(unit, skillId) + 1;
    unit.skillPoints -= 1;
    return decorateSkillForUnit(unit, ACTIVE_SKILL_MAP[skillId]);
  }

  function setEquippedActiveSkills(unit, skillIds) {
    normalizeUnitLearnedSkills(unit);
    const nextSkillIds = Array.isArray(skillIds) ? skillIds.slice(0, MAX_EQUIPPED_ACTIVE_SKILLS) : [];
    const uniqueSkillIds = [];

    nextSkillIds.forEach((skillId) => {
      if (!skillId || uniqueSkillIds.includes(skillId)) {
        return;
      }

      if (!unit.learnedActiveSkillIds.includes(skillId) && !(unit.specialActiveSkillIds || []).includes(skillId)) {
        throw new Error("장착할 수 없는 액티브 스킬입니다.");
      }

      uniqueSkillIds.push(skillId);
    });

    unit.equippedActiveSkillIds = uniqueSkillIds;
    return getActiveSkillLoadout(unit);
  }

  function equipActiveSkill(unit, skillId, slotIndex) {
    normalizeUnitLearnedSkills(unit);

    if (!unit.learnedActiveSkillIds.includes(skillId) && !(unit.specialActiveSkillIds || []).includes(skillId)) {
      throw new Error("장착할 수 없는 액티브 스킬입니다.");
    }

    const nextSlotIndex = clamp(
      typeof slotIndex === "number" ? slotIndex : unit.equippedActiveSkillIds.length,
      0,
      MAX_EQUIPPED_ACTIVE_SKILLS - 1
    );
    const loadout = unit.equippedActiveSkillIds.slice(0, MAX_EQUIPPED_ACTIVE_SKILLS);
    const existingIndex = loadout.indexOf(skillId);

    if (existingIndex >= 0) {
      loadout.splice(existingIndex, 1);
    }

    while (loadout.length < MAX_EQUIPPED_ACTIVE_SKILLS) {
      loadout.push(null);
    }

    loadout[nextSlotIndex] = skillId;
    unit.equippedActiveSkillIds = loadout.filter(Boolean).slice(0, MAX_EQUIPPED_ACTIVE_SKILLS);
    return getActiveSkillLoadout(unit);
  }

  function unequipActiveSkill(unit, slotIndex) {
    normalizeUnitLearnedSkills(unit);

    if (slotIndex < 0 || slotIndex >= MAX_EQUIPPED_ACTIVE_SKILLS) {
      return getActiveSkillLoadout(unit);
    }

    const loadout = unit.equippedActiveSkillIds.slice(0, MAX_EQUIPPED_ACTIVE_SKILLS);
    loadout.splice(slotIndex, 1);
    unit.equippedActiveSkillIds = loadout.filter(Boolean);
    return getActiveSkillLoadout(unit);
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
    normalizeUnitLearnedSkills(unit);
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

    (CLASS_SKILLS[promotion.className] || [])
      .filter((skill) => (unit.level || 1) >= skill.unlockLevel)
      .forEach((skill) => {
        if (!unit.learnedSkillIds.includes(skill.id)) {
          unit.learnedSkillIds.push(skill.id);
        }
      });

    (CLASS_ACTIVE_SKILLS[promotion.className] || [])
      .filter((skill) => (unit.level || 1) >= skill.unlockLevel)
      .forEach((skill) => {
        if (!unit.learnedActiveSkillIds.includes(skill.id)) {
          unit.learnedActiveSkillIds.push(skill.id);
        }
        unit.skillLevels[skill.id] = Math.max(1, Number(unit.skillLevels[skill.id] || 1));
      });

    if (!Array.isArray(unit.equippedActiveSkillIds)) {
      unit.equippedActiveSkillIds = [];
    }

    while (unit.equippedActiveSkillIds.length < MAX_EQUIPPED_ACTIVE_SKILLS) {
      const nextSkill = unit.learnedActiveSkillIds.find((skillId) => !unit.equippedActiveSkillIds.includes(skillId));

      if (!nextSkill) {
        break;
      }

      unit.equippedActiveSkillIds.push(nextSkill);
    }

    (PROMOTION_SKILL_REWARDS[promotion.className] || []).forEach((skillId) => {
      grantSkillById(unit, skillId);
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
    const skills = getEquippedActiveSkillsForUnit(unit);

    if (!skills.length) {
      return "없음";
    }

    return skills.map((skill) => `${skill.name} Lv.${skill.skillLevel}: ${skill.description}`).join(" / ");
  }

  function getClassProfile(unitOrClassName, weaponTypeOverride) {
    const className = typeof unitOrClassName === "string"
      ? unitOrClassName
      : unitOrClassName && unitOrClassName.className;
    const weaponType = weaponTypeOverride
      || (typeof unitOrClassName === "object" && unitOrClassName && unitOrClassName.weapon ? unitOrClassName.weapon.type : null)
      || getClassWeaponType(className);
    const classMeta = CLASS_ROLE_META[className] || null;
    const weaponMeta = WEAPON_MATCHUP_META[weaponType] || null;

    return {
      className: className || "병종",
      role: classMeta ? classMeta.role : (weaponMeta ? weaponMeta.role : "기본 병종"),
      summary: classMeta ? classMeta.summary : "특별한 병종 설명이 아직 등록되지 않았습니다.",
      strengths: classMeta ? classMeta.strengths : (weaponMeta ? weaponMeta.matchup : "상성 정보 없음"),
      caution: classMeta ? classMeta.caution : (weaponMeta ? weaponMeta.caution : "약점 정보 없음"),
      matchup: weaponMeta
        ? `${weaponMeta.matchup} ${weaponMeta.caution} 현재는 고정 무기 삼각 보정 없이 사거리, 지형, 고도, 스킬이 더 중요합니다.`
        : "현재는 고정 무기 삼각 보정보다 사거리, 지형, 고도, 스킬 상호작용이 더 중요합니다.",
      weaponType: weaponType || null
    };
  }

  function getClassWeaponType(className) {
    const weaponTypes = CLASS_WEAPON_TYPES[className];
    return weaponTypes && weaponTypes.length ? weaponTypes[0] : null;
  }

  global.SkillsService = {
    CLASS_SKILLS,
    CLASS_ACTIVE_SKILLS,
    SPECIAL_SKILLS,
    SPECIAL_ACTIVE_SKILLS,
    MAX_EQUIPPED_ACTIVE_SKILLS,
    GROWTH_RATES,
    PROMOTION_TREE,
    CLASS_ROLE_META,
    WEAPON_MATCHUP_META,
    normalizeUnitLearnedSkills,
    normalizeRosterLearnedSkills,
    getSkillsForUnit,
    getActiveSkillsForUnit,
    getEquippedActiveSkillsForUnit,
    getActiveSkillLoadout,
    getLearnableSkills,
    getLearnableActiveSkills,
    getSkillDefinition,
    getSkillPerformance,
    getSkillLevel,
    getSkillMaxLevel,
    grantSkillById,
    grantRandomMilestoneSkill,
    grantMilestoneRewardsForLevel,
    isSkillLearned,
    learnSkill,
    canLevelSkill,
    upgradeSkill,
    setEquippedActiveSkills,
    equipActiveSkill,
    unequipActiveSkill,
    getCombatModifiers,
    rollLevelGains,
    applyLevelGains,
    getNewlyUnlockedSkills,
    getNewlyUnlockedActiveSkills,
    getPromotionOptions,
    canPromote,
    promoteUnit,
    describeSkills,
    describeActiveSkills,
    getClassProfile,
    getClassWeaponType
  };
})(window);
