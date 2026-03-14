/* 역할: 전투 스테이지, 유물, 이벤트, 모집/접촉 관련 정적 데이터를 제공한다. */

(function attachBattleStageData(global) {
  const ENDLESS_STAGE_ID = "endless-rift";
  const RIFT_DEFENSE_STAGE_ID = "rift-defense";

  const ALLY_SPAWNS = [
    { x: 1, y: 6 },
    { x: 2, y: 6 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 1, y: 4 }
  ];

  const ENEMY_SPAWN_CANDIDATES = [
    { x: 12, y: 1 },
    { x: 11, y: 1 },
    { x: 12, y: 2 },
    { x: 13, y: 2 },
    { x: 11, y: 2 },
    { x: 12, y: 3 }
  ];

  const ENDLESS_ENEMY_SPAWN_CANDIDATES = [
    { x: 12, y: 1 },
    { x: 11, y: 1 },
    { x: 10, y: 1 },
    { x: 12, y: 2 },
    { x: 13, y: 2 },
    { x: 11, y: 2 },
    { x: 10, y: 2 },
    { x: 12, y: 3 },
    { x: 11, y: 3 }
  ];

  const RIFT_DEFENSE_ENEMY_SPAWNS = [
    { x: 12, y: 1 },
    { x: 11, y: 1 },
    { x: 12, y: 2 },
    { x: 13, y: 2 },
    { x: 11, y: 2 },
    { x: 12, y: 3 }
  ];

  const RIFT_DEFENSE_OBJECTIVE = {
    x: 3,
    y: 3,
    hp: 40,
    label: "거점"
  };

  const RIFT_DEFENSE_MAP_TILES = [
    ["plain", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "forest", "plain", "plain"],
    ["plain", "forest", "plain", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "hill", "plain", "plain", "forest", "plain", "plain", "hill", "plain", "plain"],
    ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"],
    ["plain", "forest", "plain", "plain", "plain", "hill", "plain", "forest", "plain", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "forest", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
  ];

  const MAP_TEMPLATE = [
    ["plain", "plain", "hill", "forest", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain"],
    ["plain", "forest", "plain", "forest", "plain", "wall", "plain", "forest", "plain", "plain", "plain", "plain"],
    ["plain", "plain", "hill", "plain", "plain", "wall", "plain", "forest", "plain", "plain", "hill", "plain"],
    ["plain", "wall", "wall", "plain", "plain", "plain", "plain", "plain", "plain", "forest", "plain", "plain"],
    ["plain", "plain", "forest", "plain", "forest", "plain", "wall", "wall", "hill", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "hill", "wall", "plain", "forest", "plain", "forest", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
  ];

  const NON_REPEATABLE_STAGE_IDS = new Set(["prologue-field"]);

  const ENDLESS_STAGE_META = {
    id: ENDLESS_STAGE_ID,
    name: "무한 균열"
  };

  const RIFT_DEFENSE_STAGE_META = {
    id: RIFT_DEFENSE_STAGE_ID,
    name: "균열 봉쇄전"
  };

  const RIFT_DEFENSE_WAVES = [
    {
      banner: "제1웨이브 시작 - 전선 형성",
      enemyArchetypeIds: ["slime_mass", "goblin_skirmisher", "raider_soldier"],
      spawnIndices: [0, 1, 2],
      reward: { gold: 40, refineStone: 1, exp: 16 }
    },
    {
      banner: "제2웨이브 시작 - 원거리 견제",
      enemyArchetypeIds: ["raider_hunter", "ghoul", "raider_swordsman"],
      spawnIndices: [0, 2, 4],
      reward: { gold: 48, refineStone: 1, exp: 18 }
    },
    {
      banner: "제3웨이브 시작 - 기동 압박",
      enemyArchetypeIds: ["dire_wolf", "harpy", "goblin_skirmisher"],
      spawnIndices: [1, 2, 3],
      reward: { gold: 56, refineStone: 1, exp: 22 }
    },
    {
      banner: "제4웨이브 시작 - 정예 반응 감지",
      enemyArchetypeIds: ["orc_reaver", "gargoyle", "skeleton_pikeman"],
      spawnIndices: [0, 2, 4],
      reward: { gold: 68, refineStone: 1, exp: 26 },
      variantBudget: 1
    },
    {
      banner: "최종 웨이브 - 균열 핵심체 출현",
      enemyArchetypeIds: ["harpy", "basilisk", "orc_reaver"],
      spawnIndices: [1, 3, 4],
      reward: { gold: 82, refineStone: 1, exp: 30 },
      variantBudget: 1,
      boss: {
        id: "rift-defense-boss",
        name: "모르가스",
        title: "균열 돌격대장",
        className: "솔저",
        weaponType: "lance",
        spawn: { x: 12, y: 2 },
        levelBonus: 3,
        maxHpBonus: 8,
        statBonuses: { str: 3, skl: 2, spd: 1, def: 2 },
        movBonus: 1,
        specialSkillIds: ["fortress_heart"],
        specialActiveSkillIds: ["guard_roar"]
      }
    }
  ];

  const RIFT_DEFENSE_GRADE_ORDER = ["S", "A", "B", "C"];

  const ENDLESS_RELICS = {
    vanguard_emblem: {
      id: "vanguard_emblem",
      name: "선봉 휘장",
      description: "출전 파티의 STR +1",
      apply(unit) {
        unit.str += 1;
      }
    },
    feather_boots: {
      id: "feather_boots",
      name: "깃털 군화",
      description: "출전 파티의 MOV +1",
      apply(unit) {
        unit.mov += 1;
      }
    },
    hawk_scope: {
      id: "hawk_scope",
      name: "매눈 조준기",
      description: "출전 파티의 SKL +2",
      apply(unit) {
        unit.skl += 2;
      }
    },
    ward_shell: {
      id: "ward_shell",
      name: "수호 갑각",
      description: "출전 파티의 DEF +2",
      apply(unit) {
        unit.def += 2;
      }
    },
    life_signet: {
      id: "life_signet",
      name: "생명의 인장",
      description: "출전 파티의 최대 HP +3",
      apply(unit) {
        unit.maxHp += 3;
        unit.hp += 3;
      }
    }
  };

  const ENDLESS_SPECIAL_RULES = [
    {
      id: "enemy_onslaught",
      name: "균열 맹공",
      description: "적 전원의 공격력이 상승한다.",
      targetTeam: "enemy",
      effect: {
        id: "rift-onslaught",
        name: "균열 맹공",
        attackPowerBonus: 2
      }
    },
    {
      id: "enemy_fortify",
      name: "강철 장막",
      description: "적 전원의 방어력이 상승한다.",
      targetTeam: "enemy",
      effect: {
        id: "rift-fortify",
        name: "강철 장막",
        defenseBonus: 2
      }
    },
    {
      id: "ally_focus",
      name: "집중의 기류",
      description: "아군 전원의 명중이 상승한다.",
      targetTeam: "ally",
      effect: {
        id: "rift-focus",
        name: "집중의 기류",
        hitBonus: 8
      }
    },
    {
      id: "swift_stride",
      name: "가속 파동",
      description: "모든 유닛의 속도가 상승한다.",
      targetTeam: "all",
      effect: {
        id: "rift-swift",
        name: "가속 파동",
        avoidBonus: 6
      }
    }
  ];

  const ENDLESS_ELITE_PROFILES = {
    sword: {
      title: "균열 검호",
      passiveSkillIds: ["warlord_presence"],
      activeSkillIds: ["boss_cleave"]
    },
    axe: {
      title: "균열 파쇄자",
      passiveSkillIds: ["warlord_presence"],
      activeSkillIds: ["boss_cleave"]
    },
    bow: {
      title: "균열 명사수",
      passiveSkillIds: ["eagle_commander"],
      activeSkillIds: ["rain_of_arrows"]
    },
    lance: {
      title: "균열 수호병",
      passiveSkillIds: ["fortress_heart"],
      activeSkillIds: ["guard_roar"]
    }
  };

  const ENDLESS_ELITE_TRAITS = [
    {
      id: "berserker",
      name: "광전",
      description: "공격력이 크게 상승한다.",
      statBonuses: { str: 2, spd: 1 },
      activeSkillIds: ["frenzy_assault"],
      effect: {
        id: "elite-berserker",
        name: "광전",
        attackPowerBonus: 2
      }
    },
    {
      id: "bulwark",
      name: "장갑",
      description: "방어와 체력이 강화된다.",
      statBonuses: { def: 2, maxHp: 4 },
      activeSkillIds: ["adamant_guard"],
      effect: {
        id: "elite-bulwark",
        name: "장갑",
        defenseBonus: 2
      }
    },
    {
      id: "deadeye",
      name: "정조준",
      description: "명중과 회피가 강화된다.",
      statBonuses: { skl: 2, spd: 1 },
      activeSkillIds: ["marked_shot"],
      effect: {
        id: "elite-deadeye",
        name: "정조준",
        hitBonus: 10,
        avoidBonus: 6
      }
    }
  ];

  const ENDLESS_EVENT_CHAINS = {
    merchant_caravan: {
      id: "merchant_caravan",
      name: "흐릿한 상단",
      starter: {
        id: "chain_merchant_start",
        title: "흐릿한 상단 흔적",
        description: "사라진 상단의 흔적을 쫓는다. 다음 이벤트층에서 결말이 열린다."
      },
      followUp: {
        id: "chain_merchant_resolve",
        title: "잃어버린 상단",
        description: "흩어진 상단을 찾아 보급품과 전리품을 회수한다."
      }
    },
    altar_echo: {
      id: "altar_echo",
      name: "울리는 제단",
      starter: {
        id: "chain_altar_start",
        title: "울리는 제단의 속삭임",
        description: "균열 제단의 속삭임을 받아들인다. 다음 이벤트층에서 응답이 온다."
      },
      followUp: {
        id: "chain_altar_resolve",
        title: "깨어난 제단",
        description: "제단이 열리며 유물의 힘이나 대체 축복을 내린다."
      }
    },
    fallen_banner: {
      id: "fallen_banner",
      name: "쓰러진 기수단",
      starter: {
        id: "chain_banner_start",
        title: "쓰러진 기수단의 깃발",
        description: "오래된 군기를 거둔다. 다음 이벤트층에서 맹세의 보답을 받는다."
      },
      followUp: {
        id: "chain_banner_resolve",
        title: "기수단의 맹세",
        description: "남겨진 의지가 파티를 단련시키고 무기를 정비한다."
      }
    },
    sealed_workshop: {
      id: "sealed_workshop",
      name: "봉인된 공방",
      starter: {
        id: "chain_workshop_start",
        title: "봉인된 공방의 문장",
        description: "잠긴 공방의 문양을 해독한다. 다음 이벤트층에서 문이 열린다."
      },
      followUp: {
        id: "chain_workshop_resolve",
        title: "열린 공방",
        description: "오래된 공방이 열리며 장비 보정과 보급품을 남긴다."
      }
    },
    lost_patrol: {
      id: "lost_patrol",
      name: "실종 순찰대",
      starter: {
        id: "chain_patrol_start",
        title: "실종 순찰대의 구조 신호",
        description: "희미한 구조 신호를 따라간다. 다음 이벤트층에서 생존자를 찾을 수 있다."
      },
      followUp: {
        id: "chain_patrol_resolve",
        title: "구조된 순찰대",
        description: "남겨진 병참과 전술 기록이 파티를 돕는다."
      }
    }
  };

  const STAGE_DEFINITIONS = [
    {
      id: "prologue-field",
      name: "프롤로그 평원",
      objective: "모든 적 격파",
      defeatCondition: "all_allies_down",
      mapTiles: MAP_TEMPLATE,
      allySpawns: ALLY_SPAWNS,
      enemySpawns: ENEMY_SPAWN_CANDIDATES,
      enemyBonus: 1,
      rewardGold: 120,
      introLines: [
        "리아: 첫 실전이지만 물러설 수 없어. 전열을 정비해.",
        "도윤: 우측 숲을 조심해. 적 지휘관이 평원을 내려다보고 있다."
      ],
      boss: {
        id: "boss-prologue",
        name: "에단",
        title: "평원 약탈단 두목",
        className: "검사",
        weaponType: "sword",
        spawn: { x: 11, y: 1 },
        levelBonus: 2,
        maxHpBonus: 4,
        statBonuses: { str: 2, skl: 1, spd: 1, def: 1 },
        movBonus: 0,
        specialSkillIds: ["warlord_presence"],
        specialActiveSkillIds: ["boss_cleave"],
        fixedDrop: {
          idPrefix: "reward-plains-sword",
          name: "평원 지휘검",
          slot: "weapon",
          type: "sword",
          rarity: "uncommon",
          might: 7,
          hit: 90,
          rangeMin: 1,
          rangeMax: 1,
          uses: 36
        }
      },
      victoryCondition: "route_enemy",
      cutsceneTitle: "프롤로그 작전 회의",
      events: [
        {
          id: "prologue-boss-half",
          trigger: "boss_hp_half",
          lines: [
            "에단: 건방진 신병들이군. 진짜 칼맛을 보여주마."
          ]
        },
        {
          id: "prologue-boss-down",
          trigger: "boss_defeated",
          lines: [
            "리아: 지휘관이 무너졌다. 남은 적을 정리하자."
          ]
        }
      ]
    },
    {
      id: "timber-ridge",
      name: "목재 능선",
      objective: "감시대장 격파 또는 적 전멸",
      mapTiles: [
        ["plain", "forest", "forest", "hill", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "plain"],
        ["plain", "forest", "wall", "plain", "plain", "wall", "plain", "forest", "plain", "plain", "plain", "plain"],
        ["plain", "plain", "wall", "plain", "forest", "wall", "hill", "plain", "plain", "plain", "forest", "plain"],
        ["plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "wall", "plain", "plain", "plain"],
        ["plain", "wall", "plain", "plain", "plain", "plain", "forest", "plain", "wall", "plain", "hill", "plain"],
        ["plain", "wall", "plain", "forest", "plain", "hill", "forest", "plain", "plain", "plain", "plain", "plain"],
        ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
      ],
      allySpawns: ALLY_SPAWNS,
      enemySpawns: [
        { x: 9, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 2 },
        { x: 9, y: 3 },
        { x: 11, y: 2 },
        { x: 10, y: 4 }
      ],
      enemyBonus: 1,
      rewardGold: 170,
      introLines: [
        "세라: 능선 위 궁수들이 보여. 섣불리 올라가면 집중 사격을 받아.",
        "리아: 숲을 엄폐물로 써서 전진한다. 지휘관부터 끊어."
      ],
      boss: {
        id: "boss-ridge",
        name: "바르카",
        title: "능선 감시대장",
        className: "헌터",
        weaponType: "bow",
        spawn: { x: 11, y: 1 },
        levelBonus: 2,
        maxHpBonus: 5,
        statBonuses: { str: 2, skl: 2, spd: 1, def: 1 },
        movBonus: 0,
        specialSkillIds: ["eagle_commander"],
        specialActiveSkillIds: ["rain_of_arrows"],
        fixedDrop: {
          idPrefix: "reward-ridge-bow",
          name: "능선 사냥활",
          slot: "weapon",
          type: "bow",
          rarity: "rare",
          might: 8,
          hit: 94,
          rangeMin: 2,
          rangeMax: 2,
          uses: 34
        }
      },
      victoryCondition: "boss_or_route",
      cutsceneTitle: "능선 돌파 브리핑",
      events: [
        {
          id: "ridge-turn-3",
          trigger: "turn_start",
          turn: 3,
          phase: "player",
          lines: [
            "도윤: 능선 위 시야가 넓다. 더 늦기 전에 우측을 압박하자."
          ]
        },
        {
          id: "ridge-boss-half",
          trigger: "boss_hp_half",
          lines: [
            "바르카: 이 정도로 능선을 넘을 수 있을 거라 생각했나?"
          ]
        },
        {
          id: "ridge-boss-down",
          trigger: "boss_defeated",
          lines: [
            "세라: 감시대장이 쓰러졌어. 활줄 소리가 줄어들고 있어."
          ]
        }
      ]
    },
    {
      id: "red-fort",
      name: "붉은 성채 외곽",
      objective: "성채 수비대장 격파",
      mapTiles: [
        ["plain", "plain", "hill", "plain", "wall", "wall", "plain", "plain", "plain", "plain", "plain", "plain"],
        ["plain", "forest", "plain", "plain", "wall", "wall", "plain", "forest", "forest", "plain", "plain", "plain"],
        ["plain", "forest", "plain", "plain", "plain", "plain", "plain", "wall", "plain", "plain", "hill", "plain"],
        ["plain", "plain", "wall", "wall", "plain", "forest", "hill", "wall", "plain", "plain", "plain", "plain"],
        ["plain", "plain", "plain", "wall", "plain", "forest", "plain", "plain", "plain", "plain", "forest", "plain"],
        ["plain", "wall", "plain", "plain", "plain", "plain", "plain", "plain", "wall", "plain", "plain", "plain"],
        ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
      ],
      allySpawns: ALLY_SPAWNS,
      enemySpawns: [
        { x: 8, y: 1 },
        { x: 9, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 2 },
        { x: 9, y: 4 },
        { x: 11, y: 3 }
      ],
      enemyBonus: 2,
      rewardGold: 220,
      introLines: [
        "리아: 저 앞이 성채 외곽이야. 여기서 밀리면 다음은 없다.",
        "도윤: 중앙 벽을 넘기보다 좌측 통로를 열고 보스를 고립시키자."
      ],
      boss: {
        id: "boss-fort",
        name: "그라드",
        title: "성채 수비대장",
        className: "솔저",
        weaponType: "lance",
        spawn: { x: 11, y: 1 },
        levelBonus: 3,
        maxHpBonus: 7,
        statBonuses: { str: 2, skl: 1, spd: 1, def: 3 },
        movBonus: 1,
        specialSkillIds: ["fortress_heart"],
        specialActiveSkillIds: ["guard_roar"],
        fixedDrop: {
          idPrefix: "reward-fort-charm",
          name: "성채 수호 인장",
          slot: "charm",
          type: "charm",
          rarity: "unique",
          statBonus: {
            def: 2,
            maxHp: 2
          }
        }
      },
      victoryCondition: "boss_defeat",
      cutsceneTitle: "성채 외곽 강습",
      events: [
        {
          id: "fort-turn-4",
          trigger: "turn_start",
          turn: 4,
          phase: "player",
          lines: [
            "리아: 성채 문 앞에서 시간을 끌수록 불리해. 지금 밀어붙여."
          ]
        },
        {
          id: "fort-boss-half",
          trigger: "boss_hp_half",
          lines: [
            "그라드: 외곽을 뚫었다고 끝난 줄 아나. 여기서 전부 묻어주마."
          ]
        },
        {
          id: "fort-boss-down",
          trigger: "boss_defeated",
          lines: [
            "도윤: 수비대장이 무너졌다. 성채 외곽 진형이 흔들린다."
          ]
        }
      ]
    }
  ];

  const RECRUIT_DEFINITIONS = {
    "prologue-field": [
      {
        unit: {
          id: "ally-4",
          name: "유진",
          team: "ally",
          className: "검사",
          level: 1,
          exp: 0,
          hp: 17,
          maxHp: 17,
          str: 6,
          skl: 7,
          spd: 7,
          def: 3,
          mov: 5,
          x: 0,
          y: 0,
          acted: false,
          alive: true,
          weapon: "recruit-sword-01",
          statPoints: 1,
          equippedItemIds: ["recruit-sword-01"]
        },
        items: [
          {
            id: "recruit-sword-01",
            name: "용병 철검",
            type: "sword",
            slot: "weapon",
            might: 5,
            hit: 88,
            rangeMin: 1,
            rangeMax: 1,
            uses: 38,
            rarity: "common",
            equippedBy: "ally-4"
          }
        ]
      }
    ],
    "timber-ridge": [
      {
        unit: {
          id: "ally-5",
          name: "하린",
          team: "ally",
          className: "헌터",
          level: 2,
          exp: 0,
          hp: 18,
          maxHp: 18,
          str: 6,
          skl: 8,
          spd: 6,
          def: 3,
          mov: 5,
          x: 0,
          y: 0,
          acted: false,
          alive: true,
          weapon: "recruit-bow-01",
          statPoints: 1,
          equippedItemIds: ["recruit-bow-01"]
        },
        items: [
          {
            id: "recruit-bow-01",
            name: "정찰 활",
            type: "bow",
            slot: "weapon",
            might: 5,
            hit: 90,
            rangeMin: 2,
            rangeMax: 2,
            uses: 34,
            rarity: "uncommon",
            equippedBy: "ally-5"
          }
        ]
      }
    ]
  };

  const ENDLESS_CONTACT_RECRUITS = {
    rift_mercenary: {
      unit: {
        id: "rift-recruit-mercenary",
        name: "카인",
        team: "ally",
        className: "검사",
        level: 3,
        exp: 0,
        hp: 18,
        maxHp: 18,
        str: 7,
        skl: 7,
        spd: 6,
        def: 4,
        mov: 5,
        x: 0,
        y: 0,
        acted: false,
        alive: true,
        weapon: "rift-recruit-mercenary-sword",
        guildRank: "B",
        potentialScore: 58,
        trainingLevel: 1,
        trainingAttempts: 0,
        statPoints: 1,
        skillPoints: 1,
        equippedItemIds: ["rift-recruit-mercenary-sword"]
      },
      items: [
        {
          id: "rift-recruit-mercenary-sword",
          name: "균열 용병검",
          type: "sword",
          slot: "weapon",
          might: 7,
          hit: 90,
          rangeMin: 1,
          rangeMax: 1,
          uses: 42,
          rarity: "rare",
          equippedBy: "rift-recruit-mercenary"
        }
      ]
    },
    rift_scout: {
      unit: {
        id: "rift-recruit-scout",
        name: "세린",
        team: "ally",
        className: "헌터",
        level: 3,
        exp: 0,
        hp: 17,
        maxHp: 17,
        str: 6,
        skl: 8,
        spd: 7,
        def: 3,
        mov: 5,
        x: 0,
        y: 0,
        acted: false,
        alive: true,
        weapon: "rift-recruit-scout-bow",
        guildRank: "B",
        potentialScore: 61,
        trainingLevel: 1,
        trainingAttempts: 0,
        statPoints: 1,
        skillPoints: 1,
        equippedItemIds: ["rift-recruit-scout-bow"]
      },
      items: [
        {
          id: "rift-recruit-scout-bow",
          name: "균열 정찰활",
          type: "bow",
          slot: "weapon",
          might: 6,
          hit: 92,
          rangeMin: 2,
          rangeMax: 2,
          uses: 38,
          rarity: "rare",
          equippedBy: "rift-recruit-scout"
        }
      ]
    }
  };

  const ENDLESS_CONTACT_EVENTS = {
    wandering_mercenary: {
      id: "wandering_mercenary",
      markerType: "npc",
      markerLabel: "용병",
      title: "길 잃은 용병",
      prompt: "무너진 벽 틈에서 부상당한 용병이 손을 든다. 아직 싸울 의지는 남아 있는 듯하다."
    },
    lost_scout: {
      id: "lost_scout",
      markerType: "npc",
      markerLabel: "정찰",
      title: "실종된 정찰병",
      prompt: "균열 안쪽에서 길을 잃은 정찰병이 지도를 움켜쥔 채 구조를 요청한다."
    },
    sealed_anvil: {
      id: "sealed_anvil",
      markerType: "site",
      markerLabel: "공방",
      title: "봉인된 모루",
      prompt: "오래된 균열 공방의 모루가 미약한 열기를 뿜는다. 건드리면 장비를 손볼 수 있을 것 같다."
    },
    whisper_shrine: {
      id: "whisper_shrine",
      markerType: "site",
      markerLabel: "제단",
      title: "속삭이는 제단",
      prompt: "붕괴한 제단에서 균열의 목소리가 들려온다. 대가를 치르면 축복을 얻을 수 있을지 모른다."
    },
    buried_cache: {
      id: "buried_cache",
      markerType: "site",
      markerLabel: "보급",
      title: "매몰된 보급고",
      prompt: "잔해 아래 숨겨진 보급 상자가 보인다. 무리해서라도 열어볼 가치가 있어 보인다."
    },
    echo_mirror: {
      id: "echo_mirror",
      markerType: "site",
      markerLabel: "거울",
      title: "회귀의 거울",
      prompt: "균열 속 거울이 파티의 전투 기억을 비춘다. 비친 기억을 손대면 성장의 흐름이나 투자 방향까지 흔들 수 있을 것 같다."
    },
    veteran_mentor: {
      id: "veteran_mentor",
      markerType: "npc",
      markerLabel: "교관",
      title: "균열의 교관",
      prompt: "낡은 군복을 입은 베테랑이 전장을 훑어보며 선다. 아직 손끝에 남은 전술과 단련법을 넘겨줄 수 있다고 한다."
    },
    rift_medic: {
      id: "rift_medic",
      markerType: "npc",
      markerLabel: "의무",
      title: "균열 의무관",
      prompt: "붕대와 약품 냄새를 풍기는 의무관이 부상자를 살핀다. 상처를 꿰매는 대가로 오래 남을 처방도 내릴 수 있다고 한다."
    },
    shattered_observatory: {
      id: "shattered_observatory",
      markerType: "site",
      markerLabel: "관측",
      title: "부서진 관측소",
      prompt: "무너진 천문 관측소의 렌즈가 균열 심부를 비춘다. 별흔을 읽어내면 전술이나 잠재를 끌어올릴 수 있을 것 같다."
    }
  };

  global.BattleStageData = {
    ENDLESS_STAGE_ID,
    RIFT_DEFENSE_STAGE_ID,
    ALLY_SPAWNS,
    ENEMY_SPAWN_CANDIDATES,
    ENDLESS_ENEMY_SPAWN_CANDIDATES,
    RIFT_DEFENSE_ENEMY_SPAWNS,
    RIFT_DEFENSE_OBJECTIVE,
    RIFT_DEFENSE_MAP_TILES,
    MAP_TEMPLATE,
    NON_REPEATABLE_STAGE_IDS,
    ENDLESS_STAGE_META,
    RIFT_DEFENSE_STAGE_META,
    RIFT_DEFENSE_WAVES,
    RIFT_DEFENSE_GRADE_ORDER,
    ENDLESS_RELICS,
    ENDLESS_SPECIAL_RULES,
    ENDLESS_ELITE_PROFILES,
    ENDLESS_ELITE_TRAITS,
    ENDLESS_EVENT_CHAINS,
    STAGE_DEFINITIONS,
    RECRUIT_DEFINITIONS,
    ENDLESS_CONTACT_RECRUITS,
    ENDLESS_CONTACT_EVENTS
  };
})(window);
